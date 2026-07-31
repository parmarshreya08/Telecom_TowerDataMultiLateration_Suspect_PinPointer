# E-Rakshak Telecom Ingestion Pipeline

E-Rakshak is a production-ready, high-throughput, telecom data ingestion pipeline designed for SIH (Smart India Hackathon). It ingests investigation datasets (CDRs, spot dumps, tower dumps) from major Indian operators (Airtel, Jio, Vi, BSNL), validates and normalizes them, and aggregates them into **Measurement Frames** optimized for downstream trilateration engines.

---

## Ingestion Pipeline Workflow

Unlike standard MVC apps, E-Rakshak is built as a linear data pipeline:

```
Officer Upload (API Endpoint)
       │
       ▼
Detector Stage (Analyzes operator type & file format)
       │
       ▼
Extractor Stage (Pulls raw data rows from Airtel, Jio, Vi, BSNL, Spot/Tower Dumps)
       │
       ▼
Validator Stage (Enforces schemas, phone length, coordinate bounds, timestamps)
       │
       ▼
Normalizer Stage (Mappers transform raw schema formats to SubscriberEventRecords)
       │
       ▼
Measurement Frame Builder (Groups spatial/temporal events into MeasurementFrames)
       │
       ▼
Database Storage / Downstream Engine Input
```

---

## Directory Structure

```
erakshak-backend/
├── app/
│   ├── main.py              # Application entrypoint (FastAPI, Lifespans, Swagger)
│   ├── api/                 # Endpoint routers (/health, /upload)
│   ├── core/                # Configuration settings, security credentials, structured logging
│   ├── ingestion/           # Pipeline components (detector, extractors, validator, normalizer, builder)
│   ├── contracts/           # Strongly typed Pydantic models (data schemas)
│   ├── database/            # SQLAlchemy models, sessions, and repository structures
│   ├── services/            # CGI decoders, lookups, and mapping utilities
│   ├── utils/               # DateTime parsing, hashing, and telecom math helpers
│   └── exceptions/          # Custom exceptions per pipeline stage
├── uploads/                 # Local directory for pending file uploads
├── logs/                    # Output folder for structured logs
├── sample_data/             # Test files and expected output mock-ups
├── tests/                   # Pytest suite mapping to pipeline stages
```

---

## Technology Stack

- **Python 3.12**
- **FastAPI** & **Uvicorn**
- **Pydantic v2** & **Pydantic Settings**
- **SQLAlchemy 2.x** & **Alembic** (PostgreSQL Async Engine)
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
