# ==============================================================================
# Builder Stage
# ==============================================================================
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies to a local directory for copying later
RUN pip install --no-cache-dir --user -r requirements.txt

# ==============================================================================
# Final Runtime Stage
# ==============================================================================
FROM python:3.12-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed python dependencies from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Create folders for uploads, logs, database
RUN mkdir -p /app/uploads /app/logs && chmod -R 777 /app/uploads /app/logs

# Copy application source code
COPY app /app/app
COPY alembic.ini /app/alembic.ini
COPY pyproject.toml /app/pyproject.toml

# Environment defaults
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_ENV=production \
    LOG_LEVEL=INFO \
    PORT=8000

EXPOSE 8000

# Healthcheck to verify FastAPI container status
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Start the uvicorn server running FastAPI main entrypoint
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
