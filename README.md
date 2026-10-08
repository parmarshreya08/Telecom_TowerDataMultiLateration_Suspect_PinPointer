# E-Rakshak — Telecom Tower Multilateration & Suspect PinPointer

Multi-operator CDR ingestion, measurement-frame building, and multilateration engine for suspect localization.

---

## Quick Start

### Backend (FastAPI)
```bash
pip install -r requirements.txt
cp .env.example .env   # fill in secrets
python -m app.main
```
- API: `http://localhost:8000`
- Swagger: `http://localhost:8000/docs`

### Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
- UI: `http://localhost:5173`

---

## Project Structure

```
├── app/                    # Backend (FastAPI)
│   ├── api/               # Route handlers
│   ├── contracts/         # Pydantic schemas & enums
│   ├── core/              # Config, security, deps
│   ├── database/          # Models, repositories, migrations
│   ├── ingestion/         # CDR/tower/spot parsers
│   ├── localization/      # Multilateration engine
│   ├── processing/        # Frame builder, fix generator
│   └── services/          # Supabase, queue, auth
├── frontend/              # React + TypeScript + Tailwind
├── scripts/               # Dev / maintenance scripts
│   ├── seed_db.py         # Seed DB with Surat multi-operator data
│   ├── generate_demo_data.py  # Generate demo CSVs for UI testing
│   └── verify_accuracy.py     # Ground-truth accuracy validation
├── tests/                 # Pytest suite (unit + integration)
├── demo_data/             # Generated demo files (gitignored)
├── sample_data/           # Reference operator CSVs for tests
└── docs/archive/          # Archived project docs
```

---

## Key Scripts

| Script | Purpose |
|--------|---------|
| `scripts/seed_db.py` | Populate DB with 4-operator Surat dataset (towers, CDRs, frames, fixes) |
| `scripts/generate_demo_data.py` | Create `demo_data/*.csv` for UI dev (tower dump, CDR, spot dump) |
| `scripts/verify_accuracy.py --generate` | Create synthetic ground-truth in `demo_data/validation/` |
| `scripts/verify_accuracy.py --case <ID>` | Compare DB fixes vs ground truth (MAE, RMSE, containment) |
| `python -m scripts.benchmark_postgis` | Benchmark PostGIS radius/KNN queries vs Python haversine fallback |

---

## PostGIS spatial queries

Tower and fix tables carry `geometry(Point, 4326)` columns maintained by
`BEFORE INSERT OR UPDATE` triggers (migration `7f3a9c2d4e5b`), with GiST
indexes on the geography cast. `TelecomRepository.find_towers_within_radius`
(`ST_DWithin`) and `find_nearest_towers` (KNN `<->`) serve radius and
nearest-tower lookups, exposed at `GET /api/towers/nearby`, with a
pure-Python haversine fallback (`_haversine_m`) when PostGIS is unavailable.
Measured on the 3,046-row Surat catalog: indexed radius query ~1.2 s,
KNN nearest-5 ~0.1 s, full-catalog Python scan ~5.3 s; a synthetic 1M-row
table answers the same 3 km radius query in ~0.3 s, which is the path for
national-scale catalogs.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `API_KEY_SECRET` — JWT signing key (`python -c "import secrets; print(secrets.token_urlsafe(48))"`)
- `DATABASE_URL` / `SYNC_DATABASE_URL` — Neon Postgres (async + sync)
- `SUPABASE_URL` / `SUPABASE_KEY` — Storage for uploaded CSVs

---

## Testing

```bash
pytest                    # all tests
pytest -q --tb=short      # concise output
pytest tests/integration/ # integration only
```

---

## Deployed

- **Backend**: https://tower-multilateration.onrender.com
- **API Docs**: https://tower-multilateration.onrender.com/docs