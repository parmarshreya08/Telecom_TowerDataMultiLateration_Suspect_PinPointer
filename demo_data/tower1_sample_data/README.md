# 1-Tower Localization Sample Data (Single Sector Engine)

This folder contains test datasets for **Single-Tower Sector Localization** with honest geometric uncertainty.

---

## 📁 Files in this Folder

1. **`tower1_airtel_cdr.csv`**:
   - Ready-to-upload Call Detail Record (CDR) CSV file.
   - Contains 5 isolated call events spread across 30-minute intervals.
   - Each event pings only **one single tower / sector** with Timing Advance (TA) and azimuth constraints.
   - Uses real Surat cell tower CGIs from `surat_cell_towers.csv`.

2. **`tower1_request_payload.json`**:
   - Direct JSON payload for testing the standalone REST API endpoint:
     `POST /api/v1/localization/estimate`

---

## 🚀 How to Test via the Web Application

1. Open the E-Rakshak Web UI in your browser: `http://localhost:5173`.
2. Navigate to **Cases** and open an existing case or create a new case (e.g. `CASE-2026-SURAT-001`).
3. Click **Upload CDR / Data** (or navigate to the Case Files page).
4. Select `demo_data/tower1_sample_data/tower1_airtel_cdr.csv`.
5. Select Operator: **Airtel** (or Auto-detect).
6. Click **Upload & Ingest**.
7. Navigate to **Live Investigation Map**:
   - Notice the **Purple Pin / Sector Marker** icon.
   - Click the marker to see the popup with:
     - **Confidence Badge**: `Coarse (1 sector)`
     - **Fix Method**: `Single-Tower Sector + Kalman`
     - **Sector Polygon**: An annular sector wedge showing exact geometry bounds derived from TA step (78.12m) and azimuth beamwidth (65°).
     - **Area Containment**: 95% probability area bounds.
   - Enable the **Probability Heatmap** layer to observe smooth, diffuse density reflecting the wedge uncertainty rather than false high-confidence artificial spikes.
