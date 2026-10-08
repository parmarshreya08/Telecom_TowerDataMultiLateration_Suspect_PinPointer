"""
Real-world accuracy evaluation of the E-Rakshak multilateration engine.

Dataset : STAR-loc (Duembgen et al., 2023, arXiv:2309.05518) -- real UWB
          two-way-ranging measurements with Vicon motion-capture ground truth,
          open access at github.com/utiasASRL/starloc.
          3 experiments: slow loop, fast loop, zigzag.

Pipeline under test : app/localization (production code, unmodified):
  - Stage 1  : JPLTrilateration via LocalizationEngine._frame_solve (NO Kalman)
  - Stage 1+2: LocalizationEngine.compute_fixes (WITH KalmanTracker)

Variants (per experiment, then pooled):
  raw      sensor ranges (uwb.csv "range")        -> stage1 / stage1+kalman
  calib    calibrated ranges ("range_calib")      -> stage1 / stage1+kalman
  gt       ground-truth ranges ("gt_range")       -> stage1 / stage1+kalman
  raw3     raw ranges, first 3 anchors per scan ("three RTT points")
  nofloor  diagnostic: same inputs but with the solver's 10 m pseudorange
           floor disabled (isolates the floor's contribution)

Anchor coordinates: recovered by least squares from the published
(tag_pos, gt_range) pairs -- exact (fit RMS ~1e-9 m) and cross-validated
against mocap/uwb_markers_v1.csv.
"""
import inspect
import json
import sys
import textwrap
from datetime import datetime, timedelta
from uuid import NAMESPACE_URL, uuid5

import numpy as np
import pandas as pd
from scipy.optimize import least_squares

REPO = r"D:\placement\hackathon\e-rakshak\Telecom_TowerDataMultiLateration_Suspect_PinPointer"
sys.path.insert(0, REPO)

from app.contracts.enums import FrameStatus
from app.contracts.measurement import MeasurementFrame, MeasurementTower
from app.localization import engine as engine_mod
from app.localization.engine import LocalizationEngine
from app.localization.gis_utils import GISUtils
from app.localization.trilateration import JPLTrilateration
from app.localization.sector_wedge import make_sector_polygon, centroid_of_intersection

DATA = {
    "loop-2d_s1": r"C:\Users\HP\AppData\Local\Temp\opencode\loop2d_s1_uwb.csv",
    "loop-2d-fast_s1": r"C:\Users\HP\AppData\Local\Temp\opencode\fast_s1_uwb.csv",
    "zigzag_s2": r"C:\Users\HP\AppData\Local\Temp\opencode\zigzag_s2_uwb.csv",
}

BASE_LAT, BASE_LON = 21.1702, 72.8311        # project home frame (Surat)
BASE_E, BASE_N, BASE_ZONE = GISUtils.latlon_to_utm(BASE_LAT, BASE_LON, zone=0)
SCAN_WINDOW_S = 0.10                          # ~1.4 full 8-anchor cycles at 8 ms cadence
UPLOAD_ID = uuid5(NAMESPACE_URL, "starloc-eval")
CASE_ID = "STARLOC-EVAL"
T0 = datetime(2026, 1, 1, 0, 0, 0)

# ---------------------------------------------------------------- helpers

def xy_to_latlon(x, y):
    """Local metric (x, y) -> WGS84, preserving metric offsets exactly."""
    return GISUtils.utm_to_latlon(BASE_E + x, BASE_N + y, zone=BASE_ZONE)

def utm_to_local(e, n):
    return np.array([e - BASE_E, n - BASE_N])

def err_stats(errors, coverage=None, extra=None):
    e = np.asarray(errors, dtype=float)
    out = {
        "n": int(e.size),
        "mean_m": round(float(e.mean()), 3),
        "median_m": round(float(np.median(e)), 3),
        "rmse_m": round(float(np.sqrt((e**2).mean())), 3),
        "p95_m": round(float(np.percentile(e, 95)), 3),
        "max_m": round(float(e.max()), 3),
        "within_1m_pct": round(float((e <= 1.0).mean() * 100), 1),
        "within_2m_pct": round(float((e <= 2.0).mean() * 100), 1),
        "within_3m_pct": round(float((e <= 3.0).mean() * 100), 1),
    }
    if coverage is not None:
        out["coverage_pct"] = round(coverage * 100, 1)
    if extra:
        out.update(extra)
    return out

def recover_anchor(g):
    P = g[["tag_pos_x", "tag_pos_y", "tag_pos_z"]].to_numpy()
    r = g["gt_range"].to_numpy()
    A2 = np.hstack([2 * P, np.ones((len(P), 1))])
    b2 = (P**2).sum(1) - r**2
    sol = np.linalg.lstsq(A2, b2, rcond=None)[0][:3]
    out = least_squares(lambda a: np.linalg.norm(P - a, axis=1) - r, sol)
    return out.x

# ---------------------------------------------------------------- data prep

def load_experiment(path):
    df = pd.read_csv(path)
    anchors = {int(aid): recover_anchor(g) for aid, g in df.groupby("to_id")}
    scans = []
    for tag, sub in df.groupby("from_id"):
        sub = sub.sort_values("time_s")
        times = sub["time_s"].to_numpy()
        aids = sub["to_id"].to_numpy().astype(int)
        rowids = sub.index.to_numpy()
        tx = sub["tag_pos_x"].to_numpy()
        ty = sub["tag_pos_y"].to_numpy()
        n = len(sub)
        i = 0
        while i < n:
            t0 = times[i]
            j = i
            seen, rows = {}, []
            while j < n and times[j] - t0 <= SCAN_WINDOW_S:
                aid = int(aids[j])
                if aid not in seen:
                    seen[aid] = j
                    rows.append(j)
                j += 1
            if len(seen) >= 3:
                tw = np.array([times[k] for k in rows])
                mid = (tw.min() + tw.max()) / 2.0
                k = rows[int(np.argmin(np.abs(tw - mid)))]
                scans.append({
                    "tag": int(tag),
                    "t": float(times[k]),
                    "rowids": {int(aids[kk]): int(rowids[kk]) for kk in rows},
                    "gt_xy": np.array([tx[k], ty[k]]),
                })
            i = max(j, i + 1)
    scans.sort(key=lambda s: s["t"])
    return df, anchors, scans

def make_frames(exp, df, scans, anchors, range_col, max_anchors=None):
    frames, gt = {}, []
    for idx, s in enumerate(scans):
        towers = []
        # time order: rowids appear in measurement order already
        for aid, rid in s["rowids"].items():
            v = df.at[rid, range_col]
            if pd.isna(v) or float(v) <= 0:
                continue
            lat, lon = xy_to_latlon(anchors[aid][0], anchors[aid][1])
            towers.append(MeasurementTower(
                tower_id=uuid5(NAMESPACE_URL, f"starloc-{aid}"),
                cgi=f"STARLOC-{exp}-{aid}",
                latitude=lat, longitude=lon,
                pseudorange_meters=float(v),
                is_catalog=True,
            ))
            if max_anchors and len(towers) >= max_anchors:
                break
        if len(towers) < 3:
            continue
        fid = uuid5(NAMESPACE_URL, f"{exp}-{idx}")
        frames[fid] = MeasurementFrame(
            frame_id=fid, upload_id=UPLOAD_ID,
            subscriber_identifier=f"{exp}-tag{s['tag']}",
            timestamp=T0 + timedelta(seconds=s["t"]),
            towers=towers, status=FrameStatus.READY,
        )
        gt.append((fid, s["gt_xy"]))
    return frames, gt

# ---------------------------------------------------------------- solvers

def run_stage1(frames):
    """No Kalman: production Stage-1 solve per frame."""
    eng = LocalizationEngine()
    out, failed = {}, 0
    for fid, fr in frames.items():
        try:
            oc = eng._frame_solve(fr)
        except Exception:
            failed += 1
            continue
        if oc is None:
            continue
        e, n = oc["position_utm"]
        out[fid] = utm_to_local(float(e), float(n))
    return out, failed

def run_full(frames):
    """With Kalman: full compute_fixes pipeline."""
    eng = LocalizationEngine()
    fixes = eng.compute_fixes(list(frames.values()), case_id=CASE_ID)
    out = {}
    for fx in fixes:
        e, n, _ = GISUtils.latlon_to_utm(fx.latitude, fx.longitude, zone=BASE_ZONE)
        out[fx.frame_id] = utm_to_local(e, n)
    return out, len(frames) - len(out)

def make_floorfree_class():
    """Identical JPLTrilateration.estimate_position, minus the 10 m clamp."""
    src = inspect.getsource(JPLTrilateration.estimate_position)
    old = "pseudoranges = np.maximum(np.asarray(pseudoranges, dtype=np.float64), min_pseudorange_m)"
    new = "pseudoranges = np.asarray(pseudoranges, dtype=np.float64)"
    assert old in src, "floor line not found -- engine source changed"
    src = src.replace(old, new)
    cls_src = "class FloorFreeJPL(JPLTrilateration):\n" + textwrap.indent(src, "    ")
    ns = {"np": np, "JPLTrilateration": JPLTrilateration, "GISUtils": GISUtils,
          "make_sector_polygon": make_sector_polygon,
          "centroid_of_intersection": centroid_of_intersection}
    exec(cls_src, ns)
    return ns["FloorFreeJPL"]

FLOORFREE = make_floorfree_class()

def set_floorfree(on):
    engine_mod.JPLTrilateration = FLOORFREE if on else JPLTrilateration

# ---------------------------------------------------------------- driver

def main():
    results = {}
    sensor = {}
    exp_data = {}
    for exp, path in DATA.items():
        df, anchors, scans = load_experiment(path)
        exp_data[exp] = (df, anchors, scans)
        raw = (df["range"] - df["gt_range"]).to_numpy()
        cal = (df["range_calib"] - df["gt_range"]).to_numpy()
        sensor[exp] = {
            "scans": len(scans),
            "raw_rmse_m": round(float(np.sqrt((raw**2).mean())), 3),
            "raw_p95_abs_m": round(float(np.percentile(np.abs(raw), 95)), 3),
            "calib_rmse_m": round(float(np.sqrt((cal**2).mean())), 3),
        }
        print(f"[{exp}] {len(scans)} scans ready")

    built = {}
    for exp, (df, anchors, scans) in exp_data.items():
        built[(exp, "raw")] = make_frames(exp, df, scans, anchors, "range")
        built[(exp, "calib")] = make_frames(exp, df, scans, anchors, "range_calib")
        built[(exp, "gt")] = make_frames(exp, df, scans, anchors, "gt_range")
        built[(exp, "raw3")] = make_frames(exp, df, scans, anchors, "range", max_anchors=3)

    plan = [
        ("raw (measured ranges)", "raw", False),
        ("calibrated ranges", "calib", False),
        ("gt ranges (oracle)", "gt", False),
        ("raw + first 3 anchors", "raw3", False),
        ("raw [10m floor disabled]", "raw", True),
        ("gt [10m floor disabled]", "gt", True),
    ]

    for label, src, floorfree in plan:
        set_floorfree(floorfree)
        for exp in DATA:
            frames_gt = built[(exp, src)]
            frames, gt = frames_gt
            if not frames:
                continue
            gt_map = dict(gt)
            for mode, runner in (("stage1", run_stage1), ("kalman", run_full)):
                pred, drop = runner(frames)
                errs = [float(np.linalg.norm(pred[fid] - gt_map[fid])) for fid in pred if fid in gt_map]
                if not errs:
                    continue
                cov = len(errs) / len(frames)
                key = f"{label} | {mode}"
                results.setdefault(key, {})[exp] = err_stats(
                    errs, coverage=cov, extra={"dropped": int(len(frames) - len(errs))})
        print(f"done: {label}" + ("  (diagnostic)" if floorfree else ""))
    set_floorfree(False)

    with open(r"C:\Users\HP\AppData\Local\Temp\opencode\eval_results.json", "w") as f:
        json.dump({"sensor": sensor, "results": results}, f, indent=2)

    print("\nSENSOR RANGE ERROR (input quality, all rows):")
    for exp, s in sensor.items():
        print(f"  {exp:18} raw RMSE {s['raw_rmse_m']} m | calib RMSE {s['calib_rmse_m']} m | scans {s['scans']}")

    hdr = f"{'variant':26} {'mode':7} {'n':>5} {'mean':>7} {'med':>7} {'rmse':>7} {'p95':>7} {'max':>8} {'<=1m':>7} {'<=2m':>7} {'cov%':>6}"
    print("\n" + "=" * len(hdr))
    print(hdr)
    print("-" * len(hdr))
    for label, _, _ in plan:
        for mode in ("stage1", "kalman"):
            key = f"{label} | {mode}"
            if key not in results:
                continue
            agg = results[key]
            tot = sum(v["n"] for v in agg.values())
            if tot == 0:
                continue
            w = lambda f: sum(f(v) * v["n"] for v in agg.values()) / tot
            rmse = float(np.sqrt(sum(v["rmse_m"] ** 2 * v["n"] for v in agg.values()) / tot))
            print(f"{label:26} {mode:7} {tot:5d} {w(lambda v: v['mean_m']):7.2f} {w(lambda v: v['median_m']):7.2f} "
                  f"{rmse:7.2f} {w(lambda v: v['p95_m']):7.2f} {max(v['max_m'] for v in agg.values()):8.2f} "
                  f"{w(lambda v: v['within_1m_pct']):6.1f}% {w(lambda v: v['within_2m_pct']):6.1f}% {w(lambda v: v['coverage_pct']):5.1f}%")
    print("=" * len(hdr))
    print("\nper-experiment detail: eval_results.json")

if __name__ == "__main__":
    main()
