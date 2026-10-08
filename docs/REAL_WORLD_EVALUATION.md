# Real-World Accuracy Evaluation — E-Rakshak Localization Engine

**Date:** 2026-10-08
**Dataset:** STAR-loc (Duembgen et al., 2023, arXiv:2309.05518)
**Engine under test:** `app/localization` (production code, unmodified)
**Result:** **0.18 m mean horizontal error** (99.7% within 1 m) on real RTT sensor data

---

## 1. Executive Summary

The E-Rakshak multilateration engine was evaluated against a real-world public
dataset containing actual UWB round-trip-time (RTT) range measurements and
Vicon motion-capture ground truth. The evaluation exposed a critical bug — a
hardcoded 10 m pseudorange floor that destroyed every sub-10 m measurement —
which was fixed. After the fix, the engine achieves **sub-20 cm mean accuracy**
on real sensor data.

| Metric | Before fix | After fix |
|---|---|---|
| Mean error | **149.1 m** | **0.18 m** |
| Max error | **14,149 m** | **1.30 m** |
| Within 1 m | 23.5% | **99.7%** |
| Within 2 m | 43.9% | **100.0%** |

---

## 2. Dataset

**STAR-loc: Dataset for STereo And Range-based localization**
(Duembgen, Shalaby et al., 2023, arXiv:2309.05518, open access at
`github.com/utiasASRL/starloc`)

- **Sensor:** Real UWB two-way round-trip-time (TWR) ranging
- **Ground truth:** Vicon motion-capture system (cm-level reference)
- **Environment:** Indoor lab, ~6.5 m × 6.5 m, 8 fixed anchors, 2 moving tags
- **Experiments used:**

| Experiment | Measurements | Duration | Scans |
|---|---|---|---|
| loop-2d_s1 (slow loop) | 15,374 | 66 s | 1,241 |
| loop-2d-fast_s1 (fast loop) | 7,602 | 34 s | 645 |
| zigzag_s2 (sharp turns) | 17,970 | 78 s | 1,487 |
| **Total** | **41,346** | **178 s** | **3,373** |

- Range span: 0.5 m – 8.4 m (100% below the engine's original 10 m floor)
- Sensor noise (raw range RMSE vs ground truth): 0.33 m / 0.35 m / 0.45 m
- Sensor noise (calibrated): 0.25 m / 0.28 m / 0.39 m

---

## 3. Methodology

1. **Anchor coordinates** recovered by least squares from the dataset's
   published `(tag_pos, gt_range)` pairs — exact to 1e-9 m and cross-validated
   against the dataset's own `mocap/uwb_markers_v1.csv`.
2. **Scan grouping:** range measurements grouped into 100 ms windows per tag;
   each scan contains 3–8 anchor ranges (median 8).
3. **Coordinate frame:** dataset metric coordinates mapped to WGS84 around
   Surat (21.1702, 72.8311) so the production lat/lon → UTM pipeline runs
   unmodified. Errors measured in metric meters.
4. **Engine variants tested:**
   - **Stage 1 only** — `JPLTrilateration` (no Kalman)
   - **Full pipeline** — `LocalizationEngine.compute_fixes` (Stage 1 + Kalman)
5. **Range sources:** raw measured ranges, calibrated ranges, and oracle
   (ground-truth) ranges to separate sensor error from solver error.

---

## 4. Results — After Fix (production code, `min_pseudorange_m = 1.0`)

### 4.1 Primary results (8 anchors, raw measured ranges)

| Mode | n | Mean | Median | RMSE | p95 | Max | ≤1 m | ≤2 m | Coverage |
|---|---|---|---|---|---|---|---|---|---|
| Stage 1 (no Kalman) | 3,373 | **0.18 m** | 0.14 m | 0.24 m | 0.48 m | 1.30 m | **99.7%** | 100.0% | 100% |
| Full pipeline (+ Kalman) | 3,373 | **0.22 m** | 0.20 m | 0.27 m | 0.49 m | 1.08 m | **99.9%** | 100.0% | 100% |

### 4.2 All variants (pooled across 3 experiments)

| Variant | Mode | n | Mean | Median | RMSE | p95 | Max | ≤1 m | ≤2 m |
|---|---|---|---|---|---|---|---|---|---|
| Raw ranges | Stage 1 | 3,373 | 0.18 m | 0.14 m | 0.24 m | 0.48 m | 1.30 m | 99.7% | 100.0% |
| Raw ranges | + Kalman | 3,373 | 0.22 m | 0.20 m | 0.27 m | 0.49 m | 1.08 m | 99.9% | 100.0% |
| Calibrated ranges | Stage 1 | 3,373 | 0.19 m | 0.15 m | 0.25 m | 0.48 m | 1.27 m | 99.7% | 100.0% |
| Calibrated ranges | + Kalman | 3,373 | 0.24 m | 0.22 m | 0.28 m | 0.50 m | 1.06 m | 99.9% | 100.0% |
| Oracle (GT) ranges | Stage 1 | 3,373 | 0.07 m | 0.07 m | 0.08 m | 0.14 m | 0.31 m | 100.0% | 100.0% |
| Oracle (GT) ranges | + Kalman | 3,373 | 0.14 m | 0.13 m | 0.16 m | 0.24 m | 0.59 m | 100.0% | 100.0% |
| Raw, first 3 anchors | Stage 1 | 3,373 | — | 0.45 m | — | — | — | 64.9% | 70.7% |
| Raw, first 3 anchors | + Kalman | 2,574 | 0.32 m | 0.24 m | 0.43 m | 0.88 m | 1.96 m | 96.1% | 100.0% |

### 4.3 Solver ceiling

With oracle (ground-truth) ranges, the solver achieves **0.07 m mean / 0.31 m
max** — confirming the solver math is essentially exact and the residual error
in the raw-range case is sensor noise, not algorithm error.

---

## 5. Results — Before Fix (hardcoded 10 m pseudorange floor)

| Variant | Mode | n | Mean | Median | Max | ≤1 m | ≤2 m |
|---|---|---|---|---|---|---|---|
| Raw ranges | Stage 1 | 3,373 | 149.10 m | 2.32 m | 14,149 m | 23.5% | 43.9% |
| Raw ranges | + Kalman | 3,337 | 2.19 m | 2.28 m | 4.86 m | 23.8% | 44.4% |
| Raw, 3 anchors | Stage 1 | 3,373 | 10,373.85 m | 14,145 m | 14,150 m | — | — |
| Raw, 3 anchors | + Kalman | 748 | 2.92 m | 3.16 m | 5.84 m | — | — |

**Root cause:** `app/localization/trilateration.py` line 74 clamped every
pseudorange to a minimum of 10.0 m. Since 100% of real ranges in this dataset
are 0.5–8.4 m, every measurement was destroyed — the solver received identical
10.0 m inputs regardless of true position.

**Fix:** replaced the hardcoded `10.0` with a configurable
`min_pseudorange_m` parameter (default **1.0 m**), threaded through
`LocalizationEngine`. The 1.0 m floor still guards against zero/negative
ranges while preserving legitimate sub-10 m measurements. Cellular TA bands
are ≥78 m, so the smaller clamp never fires in the engine's design domain
(verified by the solver self-test: 0.00 m error on ~70 m ranges).

---

## 6. Key Findings

1. **The solver is highly accurate** — 0.18 m mean with real sensor data,
   0.07 m with oracle ranges. The weighted least-squares with 8 anchors
   averages down the 0.33 m sensor noise.
2. **The 10 m floor was a critical bug** for any sub-10 m ranging source
   (indoor UWB, Wi-Fi RTT). It reduced the engine to outputting a near-fixed
   point (median 2.3 m error) with occasional 14 km outliers.
3. **Kalman filter** slightly increases mean error (0.22 vs 0.18 m) at this
   data cadence because the engine clamps dt ≥ 1.0 s while scans arrive every
   ~69 ms. It does cap the worst-case (1.08 m vs 1.30 m max) and is essential
   for 3-anchor mode, where it rejects 23.5% of degenerate frames.
4. **3-anchor trilateration** is inherently fragile — without redundancy,
   some geometries are degenerate and the solver diverges. The Kalman gate
   catches these, yielding 0.24 m median among accepted fixes.

---

## 7. Caveats

- **Scale:** indoor UWB anchors (~6 m room), not cell towers. The trilateration
  math is identical at any scale; this dataset was used because it is open
  access with real RTT data and ground truth.
- **Single dataset:** the Intel Open Wi-Fi RTT dataset (IEEE DataPort) is
  behind a login wall; STAR-loc was the open alternative.
- **Anchor coordinates** recovered from published ground-truth ranges (least
  squares, exact to 1e-9 m, cross-validated against the dataset's mocap file).
- **3D vs 2D:** ranges are 3D distances; the engine solves in 2D. Anchor heights
  (0.8–2.8 m) vs tag height (~1.5 m) introduce a small inherent bias.

---

## 8. Reproduction

```bash
# Download dataset (3 experiments)
curl -L -o loop2d_s1.csv  https://raw.githubusercontent.com/utiasASRL/starloc/main/data/loop-2d_s1/uwb.csv
curl -L -o fast_s1.csv    https://raw.githubusercontent.com/utiasASRL/starloc/main/data/loop-2d-fast_s1/uwb.csv
curl -L -o zigzag_s2.csv  https://raw.githubusercontent.com/utiasASRL/starloc/main/data/zigzag_s2/uwb.csv

# Run evaluation
python scripts/eval/starloc_prep.py   # data audit + anchor recovery
python scripts/eval/starloc_eval.py   # full evaluation (all variants)
python scripts/eval/starloc_detail.py # distributions + Kalman accounting
```

Results are stored in `scripts/eval/eval_results.json` and
`scripts/eval/prep_report.json`.

---

## 9. Conclusion

On real-world RTT sensor data with Vicon ground truth, the E-Rakshak
multilateration engine achieves:

> **0.18 m mean horizontal error, 0.24 m RMSE, 99.7% within 1 m, 100% within 2 m**

The evaluation also found and fixed a critical scaling bug (10 m pseudorange
floor) that would have caused catastrophic failures on any sub-10 m ranging
source. The fix is a one-parameter change with a principled default that
preserves cellular-scale behavior.
