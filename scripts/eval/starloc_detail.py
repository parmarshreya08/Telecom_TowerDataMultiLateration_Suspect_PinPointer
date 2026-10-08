"""Follow-up: error distributions, outlier rates, and Kalman gate accounting."""
import sys
import numpy as np

sys.path.insert(0, r"C:\Users\HP\AppData\Local\Temp\opencode")
import starloc_eval as S
from app.localization.kalman_filter import KalmanTracker

# instrument Kalman for rejection accounting
COUNT = {"calls": 0, "init_fail": 0, "rejected": 0}
_orig = KalmanTracker.update
def counting(self, *a, **k):
    COUNT["calls"] += 1
    r = _orig(self, *a, **k)
    if not r.get("initialized", False):
        COUNT["init_fail"] += 1
    elif r.get("rejected"):
        COUNT["rejected"] += 1
    return r
KalmanTracker.update = counting

def dist(e, name):
    e = np.asarray(e)
    print(f"  {name:34} n={len(e):5d}  med={np.median(e):8.3f}  mean={e.mean():9.3f}  "
          f"p95={np.percentile(e,95):8.3f}  max={e.max():10.2f}  "
          f">10m={100*(e>10).mean():5.1f}%  >100m={100*(e>100).mean():5.1f}%  >1km={100*(e>1000).mean():4.1f}%")

# rebuild frames (fast; no solves yet)
exp_data = {}
for exp, path in S.DATA.items():
    exp_data[exp] = S.load_experiment(path)

def build(src, **kw):
    out = {}
    cols = {"raw": "range", "calib": "range_calib", "gt": "gt_range", "raw3": "range"}
    if src == "raw3":
        kw.setdefault("max_anchors", 3)
    for exp, (df, anchors, scans) in exp_data.items():
        out[exp] = S.make_frames(exp, df, scans, anchors, cols[src], **kw)
    return out

def errors_stage1(frames_gt, floorfree):
    S.set_floorfree(floorfree)
    out = []
    for exp, (frames, gt) in frames_gt.items():
        gt_map = dict(gt)
        pred, _ = S.run_stage1(frames)
        out += [float(np.linalg.norm(pred[f] - gt_map[f])) for f in pred if f in gt_map]
    S.set_floorfree(False)
    return out

def errors_kalman(frames_gt, floorfree):
    S.set_floorfree(floorfree)
    out, total_frames, fixes_n = [], 0, 0
    COUNT.update(calls=0, init_fail=0, rejected=0)
    for exp, (frames, gt) in frames_gt.items():
        gt_map = dict(gt)
        pred, _ = S.run_full(frames)
        total_frames += len(frames)
        fixes_n += len(pred)
        out += [float(np.linalg.norm(pred[f] - gt_map[f])) for f in pred if f in gt_map]
    S.set_floorfree(False)
    kc = dict(COUNT)
    return out, total_frames, fixes_n, kc

raw = build("raw")
raw3 = build("raw3")
gt = build("gt")

print("\n== STAGE 1 (no Kalman), production floor ON ==")
dist(errors_stage1(raw, False), "raw ranges")
dist(errors_stage1(raw3, False), "raw, first 3 anchors")
dist(errors_stage1(gt, False), "oracle ranges")

print("\n== STAGE 1 (no Kalman), floor OFF (diagnostic) ==")
dist(errors_stage1(raw, True), "raw ranges")
dist(errors_stage1(gt, True), "oracle ranges")

print("\n== FULL ENGINE (Kalman), production floor ON ==")
for name, ds in (("raw ranges", raw), ("raw, first 3 anchors", raw3), ("oracle ranges", gt)):
    e, tot, fix, kc = errors_kalman(ds, False)
    print(f"  [{name}] frames={tot} fixes={fix} ({100*fix/tot:.1f}%)  kf_calls={kc['calls']} init_fail={kc['init_fail']} gate_rejected={kc['rejected']}")
    dist(e, name)

print("\n== FULL ENGINE (Kalman), floor OFF (diagnostic) ==")
for name, ds in (("raw ranges", raw), ("oracle ranges", gt)):
    e, tot, fix, kc = errors_kalman(ds, True)
    print(f"  [{name}] frames={tot} fixes={fix} ({100*fix/tot:.1f}%)  kf_calls={kc['calls']} init_fail={kc['init_fail']} gate_rejected={kc['rejected']}")
    dist(e, name)

# per-experiment breakdown for the two headline configs
print("\n== PER-EXPERIMENT (floor ON, raw) ==")
for exp in S.DATA:
    frames, gt_map_l = raw[exp]
    gt_map = dict(gt_map_l)
    pred, _ = S.run_stage1(frames)
    e = [float(np.linalg.norm(pred[f] - gt_map[f])) for f in pred if f in gt_map]
    dist(e, exp + " stage1")
print("\n== PER-EXPERIMENT (floor OFF, raw) ==")
S.set_floorfree(True)
for exp in S.DATA:
    frames, gt_map_l = raw[exp]
    gt_map = dict(gt_map_l)
    pred, _ = S.run_stage1(frames)
    e = [float(np.linalg.norm(pred[f] - gt_map[f])) for f in pred if f in gt_map]
    dist(e, exp + " stage1")
S.set_floorfree(False)
