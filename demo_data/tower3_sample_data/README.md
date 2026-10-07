# 3-Tower Localization Sample Data (Cheung-Lee JPL Multilateration Engine)

This folder contains test datasets for **3+ Tower Closed-Form Multilateration & Huber Loss Optimization**.

---

## 📁 Files in this Folder

1. **`tower3_airtel_cdr.csv`**:
   - Ready-to-upload Call Detail Record (CDR) CSV file.
   - Contains 3 time windows with **3 and 4 cell towers observed within 2-3 minutes**.
   - These observations merge into full multi-lateration measurement frames.
   - Uses real Surat cell tower CGIs from `surat_cell_towers.csv`.

2. **`tower3_request_payload.json`**:
   - Direct JSON payload for testing the standalone REST API endpoint:
     `POST /api/v1/localization/estimate`

---

## 🚀 How to Test via the Web Application

1. Open the E-Rakshak Web UI in your browser: `http://localhost:5173`.
2. Navigate to **Cases** and open an existing case or create a new case (e.g. `CASE-2026-SURAT-003`).
3. Click **Upload CDR / Data** (or navigate to the Case Files page).
4. Select `demo_data/tower3_sample_data/tower3_airtel_cdr.csv`.
5. Select Operator: **Airtel** (or Auto-detect).
6. Click **Upload & Ingest**.
7. Navigate to **Live Investigation Map**:
   - Notice the **Solid Red Pin / Suspect Marker** icon.
   - Click the marker to see the popup with:
     - **Confidence Badge**: `High confidence (3+ towers)`
     - **Fix Method**: `3-Tower Multilateration + Kalman` (or `4-Tower Multilateration`)
     - **High Precision**: Pinpointed suspect coordinates with tight 95% confidence ellipses.
     - **Heatmap Peak**: High intensity localized peak focused directly on the suspect's building/block.
