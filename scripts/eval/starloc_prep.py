"""
STAR-loc dataset preparation & audit.

1. Loads each experiment's uwb.csv (real UWB two-way-ranging, Vicon ground truth).
2. Recovers anchor (x,y,z) positions by least squares from the published
   (tag_pos, gt_range) pairs -- gt_range is the Vicon-derived true distance, so
   recovering anchor coordinates from it is exact (disclosed in the report).
3. Audits cadence, anchor coverage, and raw ranging error (|range - gt_range|).
"""
import json
import numpy as np
import pandas as pd
from scipy.optimize import least_squares

DATA = {
    "loop-2d_s1": r"C:\Users\HP\AppData\Local\Temp\opencode\loop2d_s1_uwb.csv",
    "loop-2d-fast_s1": r"C:\Users\HP\AppData\Local\Temp\opencode\fast_s1_uwb.csv",
    "zigzag_s2": r"C:\Users\HP\AppData\Local\Temp\opencode\zigzag_s2_uwb.csv",
}


def recover_anchor(row_df):
    """Least-squares anchor position from many (tag_pos, gt_range) samples."""
    P = row_df[["tag_pos_x", "tag_pos_y", "tag_pos_z"]].to_numpy()
    r = row_df["gt_range"].to_numpy()

    # linearized init: |p-a|^2 = r^2 -> 2 p.a - |a|^2 = |p|^2 - r^2
    A = 2 * P
    b = (P**2).sum(1) - r**2
    c = np.linalg.lstsq(A, b, rcond=None)[0]  # = a - |a|^2-scaled... standard form solves a directly if consistent
    # proper linear form: 2p.a - |a|^2 = |p|^2 - r^2, unknowns [a; |a|^2]
    A2 = np.hstack([2 * P, np.ones((len(P), 1))])
    b2 = (P**2).sum(1) - r**2
    sol = np.linalg.lstsq(A2, b2, rcond=None)[0]
    a0 = sol[:3]

    def res(a):
        return np.linalg.norm(P - a, axis=1) - r

    out = least_squares(res, a0)
    rms = float(np.sqrt(np.mean(out.fun**2)))
    return out.x, rms


def main():
    report = {}
    for name, path in DATA.items():
        df = pd.read_csv(path)
        dur = df["time_s"].max() - df["time_s"].min()
        # per-tag cadence
        cad = {}
        for tag, g in df.groupby("from_id"):
            t = np.sort(g["time_s"].to_numpy())
            d = np.diff(t)
            cad[int(tag)] = {
                "rows": int(len(g)),
                "median_dt_ms": float(np.median(d) * 1000),
                "p95_dt_ms": float(np.percentile(d, 95) * 1000),
            }
        # anchor recovery
        anchors = {}
        for aid, g in df.groupby("to_id"):
            pos, rms = recover_anchor(g)
            anchors[int(aid)] = {"xyz": [round(float(v), 4) for v in pos], "fit_rms_m": round(rms, 6)}
        # ranging error
        raw_err = (df["range"] - df["gt_range"]).to_numpy()
        cal_err = (df["range_calib"] - df["gt_range"]).to_numpy()
        # rows below the engine's 10 m floor
        frac_floored = float((df["range"] < 10.0).mean())
        report[name] = {
            "rows": int(len(df)),
            "duration_s": round(float(dur), 1),
            "anchors": sorted(int(a) for a in df["to_id"].unique()),
            "tags": sorted(int(t) for t in df["from_id"].unique()),
            "cadence": cad,
            "anchor_recovery": anchors,
            "range_error_raw": {
                "mean_m": round(float(raw_err.mean()), 3),
                "std_m": round(float(raw_err.std()), 3),
                "rmse_m": round(float(np.sqrt((raw_err**2).mean())), 3),
                "p50_abs_m": round(float(np.percentile(np.abs(raw_err), 50)), 3),
                "p95_abs_m": round(float(np.percentile(np.abs(raw_err), 95)), 3),
            },
            "range_error_calib": {
                "rmse_m": round(float(np.sqrt((cal_err**2).mean())), 3),
                "p95_abs_m": round(float(np.percentile(np.abs(cal_err), 95)), 3),
            },
            "frac_ranges_below_10m_floor": round(frac_floored, 4),
            "gt_range_span_m": [round(float(df["gt_range"].min()), 2), round(float(df["gt_range"].max()), 2)],
        }
        print(f"== {name}: {len(df)} rows, {dur:.0f}s, anchors {report[name]['anchors']}")
        print(f"   cadence: {cad}")
        print(f"   raw range error RMSE {report[name]['range_error_raw']['rmse_m']} m, "
              f"p95 {report[name]['range_error_raw']['p95_abs_m']} m; calib RMSE {report[name]['range_error_calib']['rmse_m']} m")
        print(f"   frac ranges < 10 m floor: {frac_floored:.1%}; gt_range span {report[name]['gt_range_span_m']}")
        for aid, a in sorted(anchors.items()):
            print(f"   anchor {aid}: {a['xyz']} fit_rms={a['fit_rms_m']:.6f}")

    with open(r"C:\Users\HP\AppData\Local\Temp\opencode\prep_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print("\nwrote prep_report.json")


if __name__ == "__main__":
    main()
