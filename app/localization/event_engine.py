"""
Independent Event Localization Engine.

Design rule: each event is evaluated independently. No Kalman filtering, no
constant-velocity model, no cross-event smoothing, and no time-window tower
bundling. Each event supplies zero or more per-tower RTT / TA observations; the
engine reports what it can honestly compute.
"""

from typing import Any, Optional
from collections import defaultdict

import numpy as np

from app.contracts.subscriber import SubscriberEventRecord
from app.core.logging import logger
from app.localization.gis_utils import GISUtils
from app.services.tower_lookup import TowerLookupService

C_LIGHT = 299_792_458.0  # metres per second


def _rtt_to_distance(value: float, unit: str) -> Optional[float]:
    u = unit.strip().lower()
    if u in ("us", "microsecond", "microseconds", "µs"):
        seconds = value * 1e-6
    elif u in ("ms", "millisecond", "milliseconds"):
        seconds = value * 1e-3
    elif u in ("s", "sec", "second", "seconds"):
        seconds = value
    else:
        return None
    return (C_LIGHT * seconds) / 2.0


def _sigma_to_metres(value: Optional[float], unit: str, fallback_s: float = 0.25e-6) -> float:
    if value is not None:
        d = _rtt_to_distance(value, unit)
        if d is not None:
            return max(1.0, d)
    d = _rtt_to_distance(fallback_s, "s")  # 0.25 us default ≈ 37.5 m one-way range error
    return max(1.0, d or 37.5)


def _event_group_key(r: SubscriberEventRecord) -> str:
    raw = r.raw_fields or {}
    for key in ("event_id", "eventid", "event_id".upper(), "EventId", "event_id_", "id"):
        if key in raw and str(raw[key]).strip():
            return str(raw[key]).strip()
    subscriber = r.phone_number or r.imsi or r.imei or "unknown"
    return f"{subscriber}|{r.timestamp.isoformat()}|{r.call_type.value}"


class EventResult:
    def __init__(
        self,
        event_id: str,
        timestamp: str,
        status: str,
        position: Optional[tuple[float, float]] = None,
        covariance: Optional[np.ndarray] = None,
        circles: Optional[list[dict]] = None,
        reasons: Optional[list[str]] = None,
        steps: Optional[dict] = None,
        utm_zone: int = 0,
    ):
        self.event_id = event_id
        self.timestamp = timestamp
        self.status = status
        self.position = position
        self.covariance = covariance
        self.circles = circles or []
        self.reasons = reasons or []
        self.steps = steps or {}
        self.utm_zone = utm_zone

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "event_id": self.event_id,
            "timestamp": self.timestamp,
            "status": self.status,
            "towers_used": len(self.steps.get("tower_observations", [])),
            "reasons": self.reasons,
            "circles": self.circles,
            "calculation": self.steps,
        }
        if self.position is not None:
            e, n = self.position
            lat, lon = GISUtils.utm_to_latlon(e, n, zone=self.utm_zone or 0)
            out["latitude"] = lat
            out["longitude"] = lon
        if self.covariance is not None:
            vals, vecs = np.linalg.eigh(self.covariance)
            a = float(np.sqrt(max(0.0, vals[1])) * 2.4477)
            b = float(np.sqrt(max(0.0, vals[0])) * 2.4477)
            out["confidence_ellipse_95m"] = {"semi_major_m": a, "semi_minor_m": b}
            out["covariance"] = self.covariance.tolist()
        return out


class EventLocalizationEngine:
    """Solves independent events using only measurements present in that event."""

    def __init__(self, tower_lookup: TowerLookupService):
        self.tower_lookup = tower_lookup

    async def solve_records(
        self, records: list[SubscriberEventRecord]
    ) -> list[EventResult]:
        by_event: dict[str, list[SubscriberEventRecord]] = defaultdict(list)
        for r in records:
            by_event[_event_group_key(r)].append(r)

        results: list[EventResult] = []
        for event_key, rows in by_event.items():
            results.append(await self._solve_event(event_key, rows))
        return results

    async def _solve_event(
        self, event_key: str, rows: list[SubscriberEventRecord]
    ) -> EventResult:
        steps: dict[str, Any] = {"tower_observations": [], "ignored": []}
        circles: list[dict] = []
        reasons: list[str] = []

        tower_points: list[tuple[float, float]] = []
        distances: list[float] = []
        sigmas: list[float] = []
        utm_zone = 0

        tower_objs: list[dict[str, Any]] = []

        for r in rows:
            raw = r.raw_fields or {}
            cgi = str(raw.get("cell_global_id") or r.cgi)
            coords = None
            azimuth = None
            beamwidth = None
            lookup = await self.tower_lookup.find_by_cgi(cgi)
            if lookup is not None:
                coords = (lookup.latitude, lookup.longitude)
                azimuth = lookup.azimuth
                beamwidth = lookup.beamwidth
            elif r.tower_latitude is not None and r.tower_longitude is not None:
                coords = (r.tower_latitude, r.tower_longitude)

            mtype = str(raw.get("measurement_type") or ("timing_advance" if r.timing_advance is not None else "radio_rtt")).strip().lower()
            distance: Optional[float] = None
            sigma: float = 37.5

            if r.timing_advance is not None or mtype in ("timing_advance", "ta"):
                ta_val = r.timing_advance if r.timing_advance is not None else raw.get("measurement_value")
                try:
                    ta_num = float(ta_val)
                    distance = max(ta_num * 78.12, 10.0)
                    sigma = 39.06  # half TA band
                    steps["tower_observations"].append(
                        {"cgi": cgi, "ta": ta_num, "distance_m": round(distance, 1), "sigma_m": round(sigma, 1)}
                    )
                except (TypeError, ValueError):
                    pass

            if distance is None:
                mvalue = raw.get("measurement_value") or r.rtt
                try:
                    mvalue = float(mvalue)
                except (TypeError, ValueError):
                    steps["ignored"].append({"cgi": cgi, "reason": "missing/invalid measurement_value"})
                    continue
                munit = str(raw.get("measurement_unit", "us")).strip()
                msigma = raw.get("measurement_sigma")
                try:
                    msigma = float(msigma) if msigma not in (None, "") else None
                except (TypeError, ValueError):
                    msigma = None

                distance = _rtt_to_distance(mvalue, munit)
                if distance is None:
                    steps["ignored"].append({"cgi": cgi, "reason": f"unknown unit: {munit}"})
                    continue

                sigma = _sigma_to_metres(msigma, munit)
                steps["tower_observations"].append(
                    {"cgi": cgi, "rtt": mvalue, "unit": munit, "distance_m": round(distance, 1), "sigma_m": round(sigma, 1)}
                )

            if coords is None:
                steps["ignored"].append({"cgi": cgi, "reason": "no tower coordinates"})
                continue

            e, n, z = GISUtils.latlon_to_utm(coords[0], coords[1], zone=utm_zone or 0)
            if not utm_zone:
                utm_zone = z
            tower_points.append((e, n))
            distances.append(distance)
            sigmas.append(sigma)
            circles.append({"cgi": cgi, "radius_m": round(distance, 1), "sigma_m": round(sigma, 1)})
            tower_objs.append({
                "cgi": cgi,
                "e": e,
                "n": n,
                "distance": distance,
                "sigma": sigma,
                "azimuth": azimuth,
                "beamwidth": beamwidth,
                "ta": r.timing_advance,
                "rtt": r.rtt,
            })

        event_ts = rows[0].timestamp.isoformat() if rows else ""

        if len(tower_points) == 0:
            reasons.append("No towers with usable distance observations or coordinates.")
            return EventResult(event_key, event_ts, "insufficient_data", circles=circles, reasons=reasons, steps=steps)

        # 1 Tower: Single-Sector Annular Wedge centroid
        if len(tower_points) == 1:
            from app.localization.single_tower import SingleTowerResolver
            t0 = tower_objs[0]
            res_single = SingleTowerResolver.resolve(
                center_x=t0["e"],
                center_y=t0["n"],
                timing_advance=t0.get("ta"),
                pseudorange_meters=t0["distance"],
                rtt=t0.get("rtt"),
                azimuth_deg=t0.get("azimuth"),
                beamwidth_deg=t0.get("beamwidth"),
            )
            reasons.append(f"Single-sector fix: centroid of antenna wedge (±{round(res_single['confidence_radius'])}m).")
            steps.update({"fix_method": "single_sector", "confidence_radius_m": round(res_single["confidence_radius"], 1)})
            pos_utm = (float(res_single["position"][0]), float(res_single["position"][1]))
            return EventResult(
                event_key, event_ts, "resolved",
                position=pos_utm, covariance=res_single["covariance"],
                circles=circles, reasons=reasons, steps=steps, utm_zone=utm_zone
            )

        # 2 Towers: Two-Tower Circle-Circle Intersection with Sector Wedge Disambiguation
        if len(tower_points) == 2:
            from app.localization.two_tower import TwoTowerResolver
            t0, t1 = tower_objs[0], tower_objs[1]
            res_two = TwoTowerResolver.resolve(
                c1=np.array([t0["e"], t0["n"]], dtype=np.float64),
                r1=t0["distance"],
                unc1=t0["sigma"],
                az1=t0.get("azimuth"),
                bw1=t0.get("beamwidth"),
                c2=np.array([t1["e"], t1["n"]], dtype=np.float64),
                r2=t1["distance"],
                unc2=t1["sigma"],
                az2=t1.get("azimuth"),
                bw2=t1.get("beamwidth"),
            )
            reasons.append(f"2-tower circle intersection fix (±{round(res_two['confidence_radius'])}m).")
            steps.update({
                "fix_method": "two_tower",
                "confidence_radius_m": round(res_two["confidence_radius"], 1),
                "disambiguation": res_two.get("disambiguation_reason"),
            })
            pos_utm = (float(res_two["position"][0]), float(res_two["position"][1]))
            return EventResult(
                event_key, event_ts, "resolved",
                position=pos_utm, covariance=res_two["covariance"],
                circles=circles, reasons=reasons, steps=steps, utm_zone=utm_zone
            )

        # 3+ Towers: Weighted Least-Squares Trilateration
        pos, cov, fit_steps = self._solve_weighted_ls(tower_points, distances, sigmas)
        steps.update(fit_steps)

        status = "resolved" if (fit_steps["residual_rms_m"] <= max(50.0, 2 * float(np.mean(sigmas))) and fit_steps["gdop"] < 8.0) else "uncertain"
        if status != "resolved":
            reasons.append("Residual or geometry quality is poor; treat position as uncertain.")
        else:
            reasons.append(f"Multilateration fix: {len(tower_points)} towers (RMS {fit_steps['residual_rms_m']}m).")

        return EventResult(event_key, event_ts, status, position=pos, covariance=cov, circles=circles, reasons=reasons, steps=steps, utm_zone=utm_zone)

    def _solve_weighted_ls(
        self, towers: list[tuple[float, float]], distances: list[float], sigmas: list[float]
    ) -> tuple[tuple[float, float], np.ndarray, dict[str, Any]]:
        pts = np.asarray(towers, dtype=np.float64)
        d = np.asarray(distances, dtype=np.float64)
        w = 1.0 / np.maximum(np.asarray(sigmas, dtype=np.float64), 1.0)
        w2 = w ** 2

        P = pts[0].copy()
        history = []
        for _ in range(30):
            vec = pts - P
            r = np.maximum(np.linalg.norm(vec, axis=1), 1e-6)
            U = vec / r[:, None]
            A = -U
            W = np.diag(w2)
            AtWA = A.T @ W @ A
            try:
                dx = np.linalg.solve(AtWA, A.T @ W @ (d - r))
            except np.linalg.LinAlgError:
                dx = np.linalg.pinv(AtWA) @ (A.T @ W @ (d - r))
            P = P + dx
            history.append([round(float(P[0]), 1), round(float(P[1]), 1)])
            if np.linalg.norm(dx) < 1e-3:
                break

        r = np.maximum(np.linalg.norm(pts - P, axis=1), 1e-6)
        U = (pts - P) / r[:, None]
        A = -U
        AtWA = A.T @ np.diag(w2) @ A
        cov = np.linalg.pinv(AtWA)
        gdop = float(np.sqrt(max(1e-8, np.trace(cov))))
        residuals = d - r
        rms = float(np.sqrt(np.mean(residuals ** 2)))
        return (float(P[0]), float(P[1])), cov, {
            "iterations": len(history),
            "residual_rms_m": round(rms, 1),
            "gdop": round(gdop, 2),
            "residuals_m": [round(float(x), 1) for x in residuals],
            "tower_distance_model": [{"cgi": None, "distance_m": round(float(x), 1)} for x in r],
        }
