# E-Rakshak Ground-Truth Accuracy Validation

This directory contains synthetic verification datasets for validation and testing of E-Rakshak multilateration and tracking accuracies.

## Files
- `ground_truth_case.json`: The true simulated path of the suspect device.
- `tower_catalog.csv`: The registered tower coordinates and antenna settings.
- `airtel_ground_truth_cdr.csv`: Synthetic Airtel-format CDR records mapped to the true path, including calculated Timing Advance (TA), RTT, and Signal Strength.

## Instructions
1. Upload and ingest `tower_catalog.csv` as the tower database.
2. Create a case for MSISDN `919876543210` and upload/ingest `airtel_ground_truth_cdr.csv`.
3. Run the localization engine on this case.
4. Run `python scripts/verify_accuracy.py --case <case_id>` to check accuracy metrics.
