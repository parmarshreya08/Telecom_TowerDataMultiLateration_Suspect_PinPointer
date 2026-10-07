# Forensic JSON Export Specification

## Document Overview
* **Standard:** E-Rakshak Forensic Data Exchange Standard (v1.0)
* **Target Audience:** Digital Forensics Specialists, Law Enforcement Technical Wings, Court Evidence Examiners
* **Endpoints:** `GET /api/cases/{case_id}/export/json`, `GET /api/case/{case_id}/export/json`
* **Content Type:** `application/json`

---

## 1. Purpose & Forensic Objectives
The Forensic JSON Export provides a complete, mathematically verifiable, tamper-evident record of a telecom multilateration investigation. It captures:
1. **Case & Target Metadata**: Identifiers (MSISDN, IMEI, IMSI) and case references.
2. **Mathematical Parameters**: Solver algorithm, Huber robust loss tuning ($k=1.345$), Kalman filter noise profiles ($Q, R$), UTM projection zone, and chi-squared outlier rejection thresholds.
3. **High-Precision Position Fixes**: Chronological fixes with calculated speeds (m/s), headings (0–360°), 95% circular error bounds, GDOP metrics, towers used, reverse-geocoded addresses, and raw vs. filtered coordinates.
4. **Movement Trace**: Standard GeoJSON `LineString` for direct rendering in GIS engines (QGIS, ArcGIS, Mapbox, Leaflet).
5. **Heatmap Spatial Summary**: Peak intensity coordinates and 50%/90% probability core search areas in $\text{m}^2$.
6. **Cryptographic Integrity & Chain of Custody**: Canonical SHA-256 digital signature over all payload data paired with a database-backed audit log entry ID.

---

## 2. Schema Specification (v1.0)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JsonExportPayload",
  "type": "object",
  "required": [
    "schema_version",
    "case",
    "generated_at",
    "generated_by",
    "parameters",
    "fixes",
    "trace",
    "heatmap_summary",
    "integrity"
  ],
  "properties": {
    "schema_version": {
      "type": "string",
      "enum": ["1.0"]
    },
    "case": {
      "type": "object",
      "required": ["id", "title"],
      "properties": {
        "id": { "type": "string" },
        "title": { "type": "string" },
        "target_identifiers": {
          "type": "object",
          "properties": {
            "msisdn": { "type": "string" },
            "imei": { "type": "string" },
            "imsi": { "type": "string" },
            "suspect_name": { "type": "string" },
            "subscriber_identifier": { "type": "string" }
          }
        }
      }
    },
    "generated_at": {
      "type": "string",
      "format": "date-time"
    },
    "generated_by": {
      "type": "string"
    },
    "parameters": {
      "type": "object",
      "required": ["solver", "huber_k", "kalman_q_r_config", "utm_zone", "chi2_gate"],
      "properties": {
        "solver": { "type": "string", "example": "cheung_lee_jpl" },
        "huber_k": { "type": "number", "example": 1.345 },
        "kalman_q_r_config": {
          "type": "object",
          "properties": {
            "process_noise_q": { "type": "number" },
            "measurement_noise_r": { "type": "number" },
            "target_type": { "type": "string" }
          }
        },
        "utm_zone": { "type": "integer", "example": 43 },
        "chi2_gate": { "type": "number", "example": 9.21 }
      }
    },
    "fixes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["timestamp", "lat", "lon", "confidence_radius_95_m", "fix_method"],
        "properties": {
          "timestamp": { "type": "string", "format": "date-time" },
          "lat": { "type": "number" },
          "lon": { "type": "number" },
          "speed_mps": { "type": ["number", "null"] },
          "heading_deg": { "type": ["number", "null"] },
          "confidence_radius_95_m": { "type": "number" },
          "gdop": { "type": ["number", "null"] },
          "n_towers": { "type": "integer" },
          "fix_method": {
            "type": "string",
            "enum": ["multilateration", "two_tower", "single_sector"]
          },
          "address": { "type": ["string", "null"] },
          "towers_used": {
            "type": "array",
            "items": { "type": "string" }
          },
          "raw_vs_filtered": {
            "type": "object",
            "properties": {
              "raw_lat": { "type": ["number", "null"] },
              "raw_lon": { "type": ["number", "null"] }
            }
          }
        }
      }
    },
    "trace": {
      "type": "object",
      "required": ["type", "coordinates"],
      "properties": {
        "type": { "type": "string", "enum": ["LineString"] },
        "coordinates": {
          "type": "array",
          "items": {
            "type": "array",
            "minItems": 2,
            "maxItems": 2,
            "items": { "type": "number" }
          }
        }
      }
    },
    "heatmap_summary": {
      "type": "object",
      "properties": {
        "peak_lat": { "type": ["number", "null"] },
        "peak_lon": { "type": ["number", "null"] },
        "area_50pct_m2": { "type": ["number", "null"] },
        "area_90pct_m2": { "type": ["number", "null"] }
      }
    },
    "integrity": {
      "type": "object",
      "required": ["sha256_of_payload"],
      "properties": {
        "sha256_of_payload": { "type": "string" },
        "audit_entry_id": { "type": ["string", "null"] }
      }
    }
  }
}
```

---

## 3. Example JSON Export Payload

```json
{
  "schema_version": "1.0",
  "case": {
    "id": "CASE-2026-SURAT-042",
    "title": "Operation Nightfall",
    "target_identifiers": {
      "msisdn": "+919876543210",
      "imei": "864209041234567",
      "imsi": "404450987654321",
      "suspect_name": "Ramesh Kumar"
    }
  },
  "generated_at": "2026-10-07T12:45:00.000000Z",
  "generated_by": "00000000-0000-0000-0000-000000000001",
  "parameters": {
    "solver": "cheung_lee_jpl",
    "huber_k": 1.345,
    "kalman_q_r_config": {
      "process_noise_q": 1.0,
      "measurement_noise_r": 25.0,
      "target_type": "pedestrian"
    },
    "utm_zone": 43,
    "chi2_gate": 9.21
  },
  "fixes": [
    {
      "timestamp": "2026-10-07T10:00:00+00:00",
      "lat": 21.170216,
      "lon": 72.830876,
      "speed_mps": 1.45,
      "heading_deg": 48.2,
      "confidence_radius_95_m": 38.5,
      "gdop": 1.68,
      "n_towers": 3,
      "fix_method": "multilateration",
      "address": "Ring Road, Surat, Gujarat",
      "towers_used": [
        "404-45-101-1",
        "404-45-101-2",
        "404-45-101-3"
      ],
      "raw_vs_filtered": {
        "raw_lat": 21.170216,
        "raw_lon": 72.830876
      }
    }
  ],
  "trace": {
    "type": "LineString",
    "coordinates": [
      [72.830876, 21.170216]
    ]
  },
  "heatmap_summary": {
    "peak_lat": 21.170216,
    "peak_lon": 72.830876,
    "area_50pct_m2": 7500.0,
    "area_90pct_m2": 22500.0
  },
  "integrity": {
    "sha256_of_payload": "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
    "audit_entry_id": "9f8e7d6c-5b4a-3210-fedc-ba9876543210"
  }
}
```

---

## 4. Cryptographic Hash & Verification Procedure
To verify that an exported JSON payload has not been modified or tampered with since generation:

### Verification Algorithm (Python)
```python
import json
import hashlib

def verify_forensic_export(export_payload: dict) -> bool:
    # 1. Extract the claimed hash and remove the integrity block
    claimed_hash = export_payload.get("integrity", {}).get("sha256_of_payload")
    if not claimed_hash:
        return False
    
    clean_payload = {k: v for k, v in export_payload.items() if k != "integrity"}
    
    # 2. Serialize to canonical JSON (sorted keys, no whitespace)
    canonical_json = json.dumps(
        clean_payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False
    )
    
    # 3. Compute SHA-256
    computed_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
    
    return computed_hash.lower() == claimed_hash.lower()
```

---

## 5. RBAC & Access Control
Access to the JSON export endpoint is protected by:
* **JWT Bearer Authentication**: Requires a valid, non-revoked session token.
* **Case Access Verification (`check_case_access`)**: 
  - `ADMIN` officers can export any investigation case.
  - `INSPECTOR` officers can only export cases to which they are officially assigned.
* **Forensic Audit Log (`record_audit_event`)**:
  - Automatically records an `EXPORT_JSON` audit event in PostgreSQL.
  - Captures officer ID, name, email, IP address, timestamp, fix count, and the computed SHA-256 digital hash.
