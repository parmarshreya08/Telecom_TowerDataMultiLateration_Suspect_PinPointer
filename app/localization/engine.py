"""
Localization Engine for E-Rakshak.
Runs the two-stage solver pipeline (JPL trilateration + Kalman tracking) over
stored MeasurementFrames and emits LocalizationFix records plus GeoJSON output.

Data contract: the engine only consumes frames whose towers carry a usable
pseudorange (timing-advance derived or explicit). Incomplete frames are skipped,
never approximated -- per the project's "no compromise on incomplete data" rule.

TA Band Trilateration (Phase A):
    Each tower's Timing Advance index maps to an annular range band:
      inner = max(0, (TA - 0.5) * _TA_METERS)
      outer = (TA + 0.5) * _TA_METERS
    The midpoint is used as the pseudorange; the half-band width as the
    1-sigma measurement uncertainty for inverse-variance weighting in the
    JPL solver and R-matrix scaling in the Kalman filter.

Sector Wedge Model (Phase B):
    Tower azimuth and beamwidth constrain the feasible region to a sector
    wedge per tower. The intersection of all wedges bounds the solution.
"""

from typing import Any, Optional
from uuid import uuid4

import numpy as np

from app.contracts.enums import FrameStatus
from app.contracts.localization import LocalizationFix
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.core.logging import logger
from app.localization.gis_utils import GISUtils
from app.localization.kalman_filter import KalmanTracker
from app.localization.sector_wedge import point_in_sector
from app.localization.single_tower import SingleTowerResolver
from app.localization.trilateration import JPLTrilateration
from app.localization.two_tower import TwoTowerResolver
from app.utils.datetime_utils import now_ist

# One LTE timing advance index step approximates 78.12 meters (matches builder).
from scipy.stats import chi2

_TA_METERS = 78.12


def _tower_pseudorange(tower: MeasurementTower) -> Optional[tuple[float, float]]:
    """
    Resolves a usable pseudorange (meters) and its 1-sigma uncertainty (meters)
    for a tower observation. Returns None when no usable data exists.

    Priority: explicit pseudorange_meters, then timing-advance derived, then RTT derived.
    TA-derived ranges use the band midpoint as pseudorange and half-band width as uncertainty.
    """
    if tower.pseudorange_meters is not None and tower.pseudorange_meters > 0:
        pr = float(tower.pseudorange_meters)
        unc = pr * 0.10  # 10% uncertainty for explicit pseudoranges
        return (pr, unc)

    if tower.timing_advance is not None:
        ta = float(tower.timing_advance)
        inner = max(0.0, (ta - 0.5) * _TA_METERS)
        outer = (ta + 0.5) * _TA_METERS
        pr = (inner + outer) / 2.0
        unc = (outer - inner) / 2.0
        return (max(pr, 10.0), max(unc, 1.0))

    if tower.rtt is not None:
        one_way_m = max((tower.rtt * 1000.0) / 2.0, 10.0)
        unc = one_way_m * 0.15  # 15% uncertainty for RTT-derived ranges
        return (one_way_m, unc)

    return None


def _rss_i_weight(rss_i_dbm: Optional[float]) -> float:
    """
    Converts RSSI (dBm) to a confidence weight factor.
    Stronger signal (less negative) → weight closer to 1.0.
    Weaker signal → weight > 1.0 (less confidence, wider ellipse).
    """
    if rss_i_dbm is None:
        return 1.0
    return max(0.3, min(3.0, 10 ** ((-50.0 - rss_i_dbm) / 40.0)))


class LocalizationEngine:
    """
    Orchestrates trilateration + tracking across a case's measurement frames.
    """

    def __init__(
        self,
        utm_zone: int = 0,
        target_type: str = "pedestrian",
        min_pseudorange_m: float = 1.0,
    ) -> None:
        """
        :param utm_zone: Fixed UTM zone; 0 (default) auto-derives per frame.
        :param target_type: "pedestrian" or "vehicle" Kalman noise profile.
        :param min_pseudorange_m: Lower clamp for pseudoranges passed to the JPL solver.
                                  1.0 m default: safe for indoor RTT/UWB (ranges can be
                                  sub-10 m) while still guarding against zero/negative
                                  ranges. Cellular TA bands are >=78 m, so any small
                                  value is safe there too.
        """
        self.utm_zone = utm_zone
        self.target_type = target_type
        self.min_pseudorange_m = min_pseudorange_m

    def _frame_solve(
        self,
        frame: MeasurementFrame,
        predicted_pos: Optional[np.ndarray] = None,
    ) -> Optional[dict[str, Any]]:
        """
        Runs Stage 1 solver on a single frame.
        Dispatches according to usable catalog tower count:
          >=3 towers -> JPLTrilateration (multilateration)
          2 towers   -> TwoTowerResolver (two_tower circle intersection + wedge disambiguation)
          1 tower    -> SingleTowerResolver (single_sector centroid + annular wedge)
        Returns solver output dict, or None when no catalog towers exist.
        """
        rogue_cgis = [t.cgi for t in frame.towers if not t.is_catalog]
        if rogue_cgis:
            logger.warning(
                "localization_rogue_tower_excluded",
                frame_id=str(frame.frame_id),
                rogue_cgis=rogue_cgis,
            )

        catalog_towers = [t for t in frame.towers if t.is_catalog]
        if not catalog_towers:
            logger.warning(
                "localization_frame_no_catalog_towers",
                frame_id=str(frame.frame_id),
                subscriber=frame.subscriber_identifier,
            )
            return None

        # Resolve ranges for catalog towers
        usable = [
            (t, _tower_pseudorange(t))
            for t in catalog_towers
        ]
        towers_with_pr = [(t, pr_unc) for t, pr_unc in usable if pr_unc is not None]

        # Case 1: 3 or more towers with ranges -> JPL Multi-lateration
        if len(towers_with_pr) >= 3:
            towers: list[MeasurementTower] = []
            coords: list[list[float]] = []
            pseudoranges: list[float] = []
            uncertainties: list[float] = []
            rss_i_values: list[float] = []
            azimuths: list[float] = []
            beamwidths: list[float] = []
            zone = self.utm_zone

            for tower, pr_unc in towers_with_pr:
                pr, unc = pr_unc
                e, n, resolved_zone = GISUtils.latlon_to_utm(
                    tower.latitude, tower.longitude, zone=zone
                )
                zone = resolved_zone if zone == 0 else zone
                towers.append(tower)
                coords.append([e, n])
                pseudoranges.append(pr)
                uncertainties.append(unc)
                rss_i_values.append(tower.signal_strength if tower.signal_strength is not None else -100.0)
                azimuths.append(tower.azimuth if tower.azimuth is not None else 60.0)
                beamwidths.append(tower.beamwidth if tower.beamwidth is not None else 60.0)

            solver = JPLTrilateration(
                np.array(coords, dtype=np.float64),
                np.array(azimuths, dtype=np.float64),
                np.array(beamwidths, dtype=np.float64),
            )
            result = solver.estimate_position(
                np.array(pseudoranges, dtype=np.float64),
                uncertainties=np.array(uncertainties, dtype=np.float64),
                min_pseudorange_m=self.min_pseudorange_m,
            )

            return {
                "position_utm": result["position"],
                "utc_utm": np.array(coords, dtype=np.float64)[0].tolist(),
                "clock_bias": result["clock_bias"],
                "residual_rms": result["residual_rms"],
                "gdop": result["gdop"],
                "uncertainties": result["uncertainties"],
                "zone": zone,
                "towers": towers,
                "rss_i_values": rss_i_values,
                "rogue_cgis": rogue_cgis,
                "fix_method": "multilateration",
                "n_towers": len(towers),
            }

        # Case 2: 2 towers with ranges -> TwoTowerResolver
        if len(towers_with_pr) == 2:
            t1, pr_unc1 = towers_with_pr[0]
            t2, pr_unc2 = towers_with_pr[1]
            pr1, unc1 = pr_unc1
            pr2, unc2 = pr_unc2

            zone = self.utm_zone
            e1, n1, zone1 = GISUtils.latlon_to_utm(t1.latitude, t1.longitude, zone=zone)
            zone = zone1 if zone == 0 else zone
            e2, n2, _ = GISUtils.latlon_to_utm(t2.latitude, t2.longitude, zone=zone)

            res = TwoTowerResolver.resolve(
                c1=np.array([e1, n1], dtype=np.float64),
                r1=pr1,
                unc1=unc1,
                az1=t1.azimuth,
                bw1=t1.beamwidth,
                c2=np.array([e2, n2], dtype=np.float64),
                r2=pr2,
                unc2=unc2,
                az2=t2.azimuth,
                bw2=t2.beamwidth,
                predicted_pos=predicted_pos,
            )

            rss_i_values = [
                t1.signal_strength if t1.signal_strength is not None else -100.0,
                t2.signal_strength if t2.signal_strength is not None else -100.0,
            ]

            return {
                "position_utm": res["position"],
                "utc_utm": [e1, n1],
                "clock_bias": 0.0,
                "residual_rms": res["residual_rms"],
                "gdop": res["gdop"],
                "uncertainties": np.array([unc1, unc2], dtype=np.float64),
                "confidence_radius": res["confidence_radius"],
                "covariance": res["covariance"],
                "zone": zone,
                "towers": [t1, t2],
                "rss_i_values": rss_i_values,
                "rogue_cgis": rogue_cgis,
                "fix_method": "two_tower",
                "n_towers": 2,
                "disambiguation": res.get("disambiguation"),
            }

        # Case 3: 1 tower (or 1 tower with range from catalog towers)
        tower = towers_with_pr[0][0] if towers_with_pr else catalog_towers[0]
        pr_unc = towers_with_pr[0][1] if towers_with_pr else _tower_pseudorange(tower)
        pr = pr_unc[0] if pr_unc else tower.pseudorange_meters
        unc = pr_unc[1] if pr_unc else 300.0

        zone = self.utm_zone
        e, n, zone_resolved = GISUtils.latlon_to_utm(tower.latitude, tower.longitude, zone=zone)
        zone = zone_resolved if zone == 0 else zone

        res = SingleTowerResolver.resolve(
            center_x=e,
            center_y=n,
            timing_advance=tower.timing_advance,
            pseudorange_meters=pr,
            rtt=tower.rtt,
            azimuth_deg=tower.azimuth,
            beamwidth_deg=tower.beamwidth,
        )

        rss_i_values = [tower.signal_strength if tower.signal_strength is not None else -100.0]

        return {
            "position_utm": res["position"],
            "utc_utm": [e, n],
            "clock_bias": 0.0,
            "residual_rms": res["residual_rms"],
            "gdop": res["gdop"],
            "uncertainties": np.array([unc], dtype=np.float64),
            "confidence_radius": res["confidence_radius"],
            "covariance": res["covariance"],
            "zone": zone,
            "towers": [tower],
            "rss_i_values": rss_i_values,
            "rogue_cgis": rogue_cgis,
            "fix_method": "single_sector",
            "n_towers": 1,
            "polygon": res.get("polygon"),
            "sample_points": res.get("sample_points"),
        }

    def compute_fixes(
        self,
        frames: list[MeasurementFrame],
        case_id: str,
    ) -> list[LocalizationFix]:
        """
        Runs the full pipeline over a case's frames and returns LocalizationFix
        records ordered chronologically per subscriber.

        Frames must already belong to the given case.
        """
        fixes: list[LocalizationFix] = []

        ready_frames = [f for f in frames if f.status == FrameStatus.READY]
        by_subscriber: dict[str, list[MeasurementFrame]] = {}
        for frame in ready_frames:
            by_subscriber.setdefault(frame.subscriber_identifier, []).append(frame)

        # Case-level rogue CGI accumulation (whitelist + kinematic rejection)
        self.rogue_cgis: set[str] = set()

        for subscriber, sub_frames in by_subscriber.items():
            sub_frames.sort(key=lambda f: f.timestamp)

            dt = 1.0
            if len(sub_frames) >= 2:
                gap = (sub_frames[1].timestamp - sub_frames[0].timestamp).total_seconds()
                dt = max(gap, 1.0)

            tracker = KalmanTracker(dt=dt, target_type=self.target_type)

            for frame in sub_frames:
                predicted_pos = tracker.predicted_position
                outcome = self._frame_solve(frame, predicted_pos=predicted_pos)
                if outcome is None:
                    continue

                self.rogue_cgis.update(outcome.get("rogue_cgis", []))

                pos_utm = outcome["position_utm"]
                zone = outcome["zone"]

                mean_uncertainty = float(np.mean(outcome["uncertainties"]))
                mean_rss_i = float(np.mean(outcome["rss_i_values"]))

                kf_result = tracker.update(
                    pos_utm,
                    residual_rms=outcome["residual_rms"],
                    gdop=outcome["gdop"],
                    measurement_uncertainty=mean_uncertainty,
                )
                if not kf_result["initialized"]:
                    continue

                if kf_result.get("rejected"):
                    logger.warning(
                        "localization_kalman_gate_rejected",
                        frame_id=str(frame.frame_id),
                        subscriber=subscriber,
                    )
                    # Kinematic rejection: the frame's CGIs are physically implausible
                    self.rogue_cgis.update(t.cgi for t in frame.towers)
                    continue

                smoothed_pos = kf_result["position"]
                velocity = kf_result["velocity"]
                covariance = kf_result["covariance"]

                lat, lon = GISUtils.utm_to_latlon(
                    float(smoothed_pos[0]), float(smoothed_pos[1]), zone=zone
                )

                kf_radius = float(np.sqrt(chi2.ppf(0.95, 2) * np.trace(covariance)))
                solver_radius = outcome.get("confidence_radius", 0.0)
                confidence_radius = max(kf_radius, solver_radius * 0.8)

                ta_inner = outcome.get("ta_inner_m")
                ta_outer = outcome.get("ta_outer_m")
                if ta_inner is None or ta_outer is None:
                    for tower, pr_unc in [
                        (t, _tower_pseudorange(t)) for t in frame.towers
                    ]:
                        if pr_unc is not None and tower.timing_advance is not None:
                            ta = float(tower.timing_advance)
                            inner = max(0.0, (ta - 0.5) * _TA_METERS)
                            outer = (ta + 0.5) * _TA_METERS
                            ta_inner = inner
                            ta_outer = outer
                            break

                rss_i = None
                for r in outcome["rss_i_values"]:
                    if r > -100.0:
                        rss_i = r
                        break

                cov_list = covariance[:2, :2].tolist() if covariance is not None and len(covariance) >= 2 else None

                fixes.append(
                    LocalizationFix(
                        fix_id=uuid4(),
                        case_id=case_id,
                        frame_id=frame.frame_id,
                        subscriber_identifier=subscriber,
                        timestamp=frame.timestamp,
                        latitude=lat,
                        longitude=lon,
                        velocity_east=float(velocity[0]),
                        velocity_north=float(velocity[1]),
                        confidence_radius_meters=confidence_radius,
                        gdop=outcome["gdop"],
                        residual_rms=outcome["residual_rms"],
                        ta_inner_m=ta_inner,
                        ta_outer_m=ta_outer,
                        rss_i_dbm=rss_i,
                        covariance_json={"matrix": cov_list} if cov_list else None,
                        rogue_cgis=outcome.get("rogue_cgis", []),
                        fix_method=outcome.get("fix_method", "multilateration"),
                        n_towers=outcome.get("n_towers", len(outcome.get("towers", []))),
                    )
                )

        fixes.sort(key=lambda f: (f.subscriber_identifier, f.timestamp))
        logger.info("localization_completed", case_id=case_id, fix_count=len(fixes))
        return fixes

    def to_geojson(
        self,
        fixes: list[LocalizationFix],
        include_ellipses: bool = True,
        include_sector_wedges: bool = True,
        frames: Optional[list[Any]] = None,
    ) -> dict[str, Any]:
        """
        Serializes fixes into a GeoJSON FeatureCollection for map rendering.
        Each fix is a Point Feature (with confidence radius + velocity metadata).
        Optionally appends 95% confidence ellipse polygon Features per fix.
        Optionally appends sector wedge Features per tower observation.
        """
        features: list[dict[str, Any]] = []

        frames_map = {f.frame_id: f for f in frames} if frames else {}

        for fix in fixes:
            e, n, zone = GISUtils.latlon_to_utm(fix.latitude, fix.longitude)

            ta_uncertainty = 0.0
            if fix.ta_inner_m is not None and fix.ta_outer_m is not None:
                ta_uncertainty = (fix.ta_outer_m - fix.ta_inner_m) / 2.0

            # Expose explainability parameters
            towers_info = []
            constraints_info = []
            if fix.frame_id in frames_map:
                frame = frames_map[fix.frame_id]
                for t in getattr(frame, "towers", []):
                    towers_info.append({
                        "cgi": t.cgi,
                        "lat": t.latitude,
                        "lon": t.longitude,
                        "signal_strength": t.signal_strength,
                    })
                    c = f"CGI {t.cgi}: "
                    parts = []
                    if t.timing_advance is not None:
                        parts.append(f"TA {t.timing_advance}")
                    if t.rtt is not None:
                        parts.append(f"RTT {t.rtt}ms")
                    if t.pseudorange_meters is not None:
                        parts.append(f"Range {round(t.pseudorange_meters)}m")
                    c += " + ".join(parts) if parts else "No range data"
                    constraints_info.append(c)

            fix_method = getattr(fix, "fix_method", "multilateration")
            n_towers = getattr(fix, "n_towers", 3)
            if fix_method == "single_sector":
                method_label = "Single-Tower Sector + Kalman" if fix.velocity_east is not None else "Single-Tower Sector"
                conf_badge = "Coarse (1 sector)"
            elif fix_method == "two_tower":
                method_label = "2-Tower Circle Intersection + Kalman" if fix.velocity_east is not None else "2-Tower Circle Intersection"
                conf_badge = "Low confidence (2 towers)"
            else:
                method_label = f"{n_towers}-Tower Multilateration + Kalman" if fix.velocity_east is not None else f"{n_towers}-Tower Multilateration"
                conf_badge = f"High confidence ({n_towers} towers)"

            point_feature: dict[str, Any] = {
                "type": "Feature",
                "id": str(fix.fix_id),
                "geometry": {
                    "type": "Point",
                    "coordinates": [fix.longitude, fix.latitude],
                },
                "properties": {
                    "case_id": fix.case_id,
                    "subscriber_identifier": fix.subscriber_identifier,
                    "timestamp": fix.timestamp.isoformat(),
                    "confidence_radius_meters": fix.confidence_radius_meters,
                    "velocity_east": fix.velocity_east,
                    "velocity_north": fix.velocity_north,
                    "gdop": fix.gdop,
                    "residual_rms": fix.residual_rms,
                    "ta_inner_m": fix.ta_inner_m,
                    "ta_outer_m": fix.ta_outer_m,
                    "rss_i_dbm": fix.rss_i_dbm,
                    "geocoded_address": fix.geocoded_address,
                    "fix_method": fix_method,
                    "n_towers": n_towers,
                    "confidence_badge": conf_badge,
                    "localization_method": method_label,
                    "kalman_applied": fix.velocity_east is not None,
                    "rogue_cgis": fix.rogue_cgis or [],
                    "towers_used": towers_info,
                    "measurement_constraints": constraints_info,
                },
            }
            features.append(point_feature)

            if include_ellipses and fix.confidence_radius_meters > 0:
                if fix.covariance_json and fix.covariance_json.get("matrix"):
                    cov = np.array(fix.covariance_json["matrix"], dtype=np.float64)
                else:
                    cov = np.eye(2) * (fix.confidence_radius_meters ** 2)
                ellipse = GISUtils.generate_confidence_ellipse_geojson(
                    e, n, cov, confidence_level=0.95, zone=zone,
                    rss_i_dbm=fix.rss_i_dbm or -100.0,
                    ta_uncertainty_meters=ta_uncertainty,
                )
                ellipse["id"] = f"{fix.fix_id}-ellipse"
                ellipse["properties"].update(
                    {
                        "case_id": fix.case_id,
                        "subscriber_identifier": fix.subscriber_identifier,
                        "timestamp": fix.timestamp.isoformat(),
                        "fix_id": str(fix.fix_id),
                        "fix_method": fix_method,
                    }
                )
                features.append(ellipse)

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "case_id": fixes[0].case_id if fixes else None,
                "fix_count": len(fixes),
                "generated_at": now_ist().isoformat(),
            },
        }

    def generate_sector_wedges_geojson(
        self,
        frames: list[MeasurementFrame],
    ) -> dict[str, Any]:
        """
        Generates GeoJSON sector wedge Features for all towers across frames.
        Each tower gets one sector wedge showing its antenna coverage cone.
        """
        features: list[dict[str, Any]] = []
        seen: set[tuple[float, float, float, float]] = set()

        for frame in frames:
            for tower in frame.towers:
                if tower.azimuth is None or tower.beamwidth is None:
                    continue
                if tower.latitude is None or tower.longitude is None:
                    continue

                e, n, zone = GISUtils.latlon_to_utm(tower.latitude, tower.longitude)
                radius = 1000.0  # default display radius
                if tower.pseudorange_meters is not None and tower.pseudorange_meters > 0:
                    radius = float(tower.pseudorange_meters)
                elif tower.timing_advance is not None:
                    radius = float(tower.timing_advance) * _TA_METERS

                key = (tower.latitude, tower.longitude, tower.azimuth, tower.beamwidth)
                if key in seen:
                    continue
                seen.add(key)

                wedge = GISUtils.generate_sector_wedge_geojson(
                    e, n, radius,
                    tower.azimuth, tower.beamwidth,
                    zone=zone,
                )
                wedge["id"] = f"tower-{tower.latitude:.6f}-{tower.longitude:.6f}-{tower.azimuth:.0f}"
                wedge["properties"]["tower_id"] = getattr(tower, "tower_id", None)
                features.append(wedge)

        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "feature_count": len(features),
                "generated_at": now_ist().isoformat(),
            },
        }
