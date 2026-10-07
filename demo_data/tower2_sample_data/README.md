# 2-Tower Localization Sample Data (Circle-Circle Intersection Engine)

This folder contains test datasets for **Two-Tower Analytical Localization** with sector wedge and Kalman prior disambiguation.

---

## 📁 Files in this Folder

1. **`tower2_airtel_cdr.csv`**:
   - Ready-to-upload Call Detail Record (CDR) CSV file.
   - Contains 4 distinct time windows where the target makes calls from **2 nearby cell towers within a 90-second window**.
   - These pairs merge into 2-tower measurement frames.
   - Uses real Surat cell tower CGIs from `surat_cell_towers.csv`.

2. **`tower2_request_payload.json`**:
   - Direct JSON payload for testing the standalone REST API endpoint:
     `POST /api/v1/localization/estimate`

---

## 🚀 How to Test via the Web Application

1. Open the E-Rakshak Web UI in your browser: `http://localhost:5173`.
2. Navigate to **Cases** and open an existing case or create a new case (e.g. `CASE-2026-SURAT-002`).
3. Click **Upload CDR / Data** (or navigate to the Case Files page).
4. Select `demo_data/tower2_sample_data/tower2_airtel_cdr.csv`.
5. Select Operator: **Airtel** (or Auto-detect).
6. Click **Upload & Ingest**.
7. Navigate to **Live Investigation Map**:
   - Notice the **Amber Pin / 2-Tower Marker** icon.
   - Click the marker to see the popup with:
     - **Confidence Badge**: `Low confidence (2 towers)`
     - **Fix Method**: `2-Tower Circle Intersection + Kalman`
     - **Analytical Geometry**: Disambiguates between the 2 circle-circle intersection candidates using antenna sector azimuths/beamwidths and Kalman motion vector predictions.
     - **Honest Uncertainty**: Confidence radius scaled by geometric dilution ($\sin \theta$) to account for circle intersection geometry.
