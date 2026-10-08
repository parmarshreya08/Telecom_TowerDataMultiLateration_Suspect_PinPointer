# SDR (Software-Defined Radio) RF Verification Sample Data

This directory contains realistic ground-truth SDR spectrum analyzer sweep datasets formatted for testing the RF Signal Path-Loss & Ground Truth Corroboration Engine.

---

## 📁 Available Datasets

| File Name | Format | Sector / Area | Expected Verdict | Confidence | Use Case |
|---|---|---|---|---|---|
| `sdr_sweep_surat_piplod_high_confidence.csv` | CSV | Surat Piplod / SVNIT | `HIGH_CONFIDENCE_VERIFIED` | ~96-98% | Primary field test verification |
| `sdr_sweep_surat_piplod_high_confidence.json` | JSON | Surat Piplod / SVNIT | `HIGH_CONFIDENCE_VERIFIED` | ~96-98% | REST API payload verification |
| `sdr_sweep_surat_citycenter_verified.csv` | CSV | Surat Ring Road / Majura | `HIGH_CONFIDENCE_VERIFIED` | ~95-97% | Multi-sector urban verification |
| `sdr_sweep_surat_citycenter_verified.json` | JSON | Surat Ring Road / Majura | `HIGH_CONFIDENCE_VERIFIED` | ~95-97% | REST API payload verification |
| `sdr_sweep_surat_jahangirpura_corroborated.csv` | CSV | Surat Jahangirpura / Rander | `HIGH_CONFIDENCE_VERIFIED` | ~92-95% | Dense cell corroboration |
| `sdr_sweep_surat_jahangirpura_corroborated.json` | JSON | Surat Jahangirpura / Rander | `HIGH_CONFIDENCE_VERIFIED` | ~92-95% | REST API payload verification |
| `sdr_sweep_anomalous_gps_spoof.csv` | CSV | Piplod Area (Spoofed) | `ANOMALOUS_DISCREPANCY` | <15% | Spoofing / Jammer anomaly detection |
| `sdr_sweep_anomalous_gps_spoof.json` | JSON | Piplod Area (Spoofed) | `ANOMALOUS_DISCREPANCY` | <15% | Spoofing / Jammer anomaly detection |

---

## 🔬 CSV Schema

| Column Name | Required | Description | Example |
|---|---|---|---|
| `cgi` | Yes | Cell Global Identity (MCC-MNC-LAC-CellID) | `405-867-1002-10001` |
| `latitude` | Yes | Tower latitude (decimal degrees) | `21.16151` |
| `longitude` | Yes | Tower longitude (decimal degrees) | `72.78314` |
| `measured_rssi_dbm` | Yes | Measured field signal strength in dBm | `-58.2` |
| `frequency_mhz` | No | Carrier center frequency (default: 1800 MHz) | `1800.0` |
| `timing_advance_meters` | No | Timing Advance converted to distance | `430.0` |
| `azimuth_deg` | No | Tower directional antenna azimuth | `257.8` |
| `site_address` | No | Physical site or tower description | `Plot 63 Near SVNIT` |

---

## ⚡ How to Test in the Application

### Option A: In the Live Investigation Workspace
1. Navigate to **Investigation Workspace** (`/investigations`).
2. Open any active case with suspect coordinates (e.g., Surat case).
3. Click **"Upload SDR / Field RF Sweep"** in the left sidebar or toolbar.
4. Drag-and-drop or select `sdr_sweep_surat_piplod_high_confidence.csv` or any sample file above.
5. Click **"Check RF Consistency"**.
6. The system evaluates the 3GPP path-loss model, correlates the measured RSSI, and pins the verified ground-truth target within **±5m** accuracy with full telemetry.

### Option B: On the Landing Page RF Tester
1. Go to the Home / Landing Page.
2. Switch to the **"RF Corroboration"** tab.
3. Test custom parameters or click **"Run Mathematical RF Cross-Check"** to evaluate live path loss and per-tower consistency scores.

### Option C: Via FastAPI Backend Endpoint
```bash
curl -X POST "http://localhost:8000/api/v1/sdr/verify-rf" \
  -H "Content-Type: application/json" \
  -d @demo_data/sdr_sample_data/sdr_sweep_surat_piplod_high_confidence.json
```
