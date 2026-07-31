# E-Rakshak Telecom Ingestion Pipeline

E-Rakshak is a cybersecurity and innovation hackathon organized by Surat City Police in collaboration with NEXUS and SVNIT Surat. The event aims to inspire students to build impactful technological solutions that enhance digital safety, cybercrime prevention, forensic intelligence, and online security ecosystems.

This project is the backend component of a suspect localization system being developed for the E-Rakshak Hackathon. Its responsibility is to centralize telecom investigation datasets from multiple telecom operators, validate them, normalize them into a common internal representation, and prepare clean structured data for downstream suspect localization and multilateration modules.

---

## Ingestion Pipeline Workflow

The backend is built as a linear data pipeline that processes heterogeneous telecom datasets and converts them into a standardized internal model:

```
Officer Upload (API Endpoint)
       │
       ▼
Detector Stage (Analyzes operator type & file format)
       │
       ▼
Extractor Stage (Pulls raw data rows from Airtel, Jio, Vi, BSNL)
       │
       ▼
Validator & Enrichment Stage (Normalizes phone numbers, verifies timestamps & CGIs, computes quality scores, and performs deduplication)
       │
       ▼
ValidatedSubscriberRecord (Clean structured data ready for downstream modules)
```

Localization and multilateration are downstream components and are outside the current implementation.

---

## Directory Structure

```
erakshak-backend/
├── app/
│   ├── main.py              # Application entrypoint (FastAPI, Lifespans, Swagger)
│   ├── api/                 # Endpoint routers (/health, /upload)
│   ├── core/                # Configuration settings, structured logging
│   ├── ingestion/           # Pipeline components (detector, extractors)
│   ├── processing/          # Validation & enrichment engine (validator, service, rules)
│   ├── contracts/           # Strongly typed Pydantic models (data schemas)
│   ├── database/            # SQLAlchemy database connection setups
│   ├── services/            # CGI decoders, lookups, and mapping utilities (placeholders)
│   ├── utils/               # DateTime parsing, hashing, and telecom math helpers
│   └── exceptions/          # Custom exceptions per pipeline stage
├── uploads/                 # Local directory for pending file uploads
├── logs/                    # Output folder for structured logs
├── sample_data/             # Test files and expected output mock-ups
├── tests/                   # Pytest suite mapping to pipeline stages
```

---

## Current Implementation

The following features and modules are currently implemented:
- **File Upload Support**: HTTP POST endpoint to accept and temporarily buffer raw logs.
- **Telecom File Detection**: Automated heuristic determination of operator and format.
- **Airtel CDR Parser**: Dynamic, order-independent streaming extraction.
- **Jio CDR Parser**: Streaming Jio CSV schema extraction.
- **Vi CDR Parser**: Streaming Vi CSV schema extraction.
- **BSNL CDR Parser**: Streaming BSNL CSV schema extraction.
- **Common SubscriberEventRecord Model**: Standard intermediate data contract.
- **Validation & Enrichment Pipeline**: Standardized engine executing validation checks.
- **Phone Number Normalization**: Strips prefixes (+91, 91, leading 0) into 12-digit standard.
- **Deduplication**: Identifies and filters duplicates using key composites.
- **Quality Score Generation**: Metrics (0.0 to 1.0) indicating optional metadata completeness.
- **Validation Statistics**: Validation execution metrics generated per batch run.
- **Unit Tests**: Full test suite verifying detector, extractors, and processing rules.

---

## Future Work

The following modules and features are planned but are **NOT** implemented yet:
- **PostgreSQL Persistence**: Storing events in a database.
- **Repository Layer**: Database access patterns.
- **Upload Metadata Management**: Database tracking for batch metadata.
- **Tower Master Ingestion**: Database loaders for tower coordinates maps.
- **Tower Dump Ingestion**: Extractor parsing for cell site mapping files.
- **Location Resolution Service**: Resolving CGI codes into physical lat/lon coordinates.
- **Measurement Frame Builder**: Grouping subscriber events into measurement frames.
- **Multilateration Engine**: Downstream spatial trilateration.
- **Suspect Pin Pointer**: Main dashboard engine for pinning target locations.
- **Kalman Filter**: Spatial trajectory smoothing.
- **GeoJSON Generation**: Exporting paths for map rendering.
- **Heatmap Visualization**: Downstream mapping analytics.
- **Investigation Dashboard**: Frontend user interface.

---

## Technology Stack

- **Python 3.12**
- **FastAPI** & **Uvicorn**
- **Pydantic v2** & **Pydantic Settings**
- **SQLAlchemy 2.x** & **Alembic** (Async Engine Setup)
- **pandas** & **numpy**
- **structlog** (JSON-structured logging)
- **pytest** (async testing support)
- **black**, **isort**, **mypy** (code quality)

---

## Local Setup

### 1. Requirements & Dependencies
Make sure you have python 3.12+ installed. Install the requirements:
```bash
pip install -r requirements.txt
```

### 2. Run Database and Application with Docker
```bash
docker compose up --build
```
The server will start at `http://localhost:8000`.
- Swagger docs: `http://localhost:8000/docs`
- Health check endpoint: `http://localhost:8000/health`

### 3. Running Tests & Quality Checks
Run unit tests:
```bash
pytest
```
Format files:
```bash
black app tests
isort app tests
```
Run type analysis:
```bash
mypy app
```
