"""
E-Rakshak configuration management.
Defines system settings using Pydantic Settings v2.
"""

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Origins that must ALWAYS be allowed, regardless of how CORS_ORIGINS is set.
# These are the real deployment URLs — keeping them here prevents the
# "works on localhost, blocked in production" failure mode where the hosted
# frontend calls a separate backend origin (hardcoded in the built bundle).
REQUIRED_CORS_ORIGINS = (
    "https://tower-multilateration.onrender.com",
)


class Settings(BaseSettings):
    """
    Application Settings populated from system environment or .env file.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # General App Configs
    APP_NAME: str = Field(default="E-Rakshak Telecom Ingestion")
    APP_ENV: str = Field(default="development")
    DEBUG: bool = Field(default=True)
    LOG_LEVEL: str = Field(default="INFO")
    HOST: str = Field(default="0.0.0.0")
    PORT: int = Field(default=8000)
    CORS_ORIGINS: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:4173,http://127.0.0.1:4173",
        description="Comma-separated list of allowed CORS origins",
    )

    @field_validator("CORS_ORIGINS")
    @classmethod
    def _ensure_required_origins(cls, value: str) -> str:
        """Merge the always-allowed deployment origins into CORS_ORIGINS.

        Guarantees the production frontend is never rejected even if the
        CORS_ORIGINS env var is missing, stale, or only lists localhost.
        """
        origins = [o.strip() for o in value.split(",") if o.strip()]
        for required in REQUIRED_CORS_ORIGINS:
            if required not in origins:
                origins.append(required)
        return ",".join(origins)
    API_KEY_SECRET: str = Field(
        ...,
        description="Secret key for JWT signing and API authentication (must be set in .env)",
    )

    # Database Settings
    DATABASE_URL: str = Field(
        ...,
        description="Async Postgres DSN (postgresql+asyncpg://...)"
    )
    SYNC_DATABASE_URL: str = Field(
        ...,
        description="Sync Postgres DSN for Alembic (postgresql+psycopg2://...)"
    )

    # Storage Settings
    MAX_CONTENT_LENGTH_MB: int = Field(default=100)
    ALLOWED_EXTENSIONS: str = Field(default="csv,xlsx,xls,txt,docx,pdf")

    # Supabase Storage Settings
    SUPABASE_URL: str = Field(default="")
    SUPABASE_KEY: str = Field(default="")
    SUPABASE_BUCKET: str = Field(default="erakshak-uploads")

    # Google Drive Picker Settings (Drive import via frontend OAuth popup)
    GOOGLE_CLIENT_ID: str = Field(default="")
    GOOGLE_API_KEY: str = Field(default="")
    GOOGLE_PROJECT_ID: str = Field(default="")

    # Localization Engine Settings
    UTM_ZONE: int = Field(default=43, description="Default UTM zone; auto-derived from longitude when 0")

    # OpenCellID Fallback Settings
    OPENCELLID_API_KEY: str = Field(default="", description="OpenCellID API key for tower geolocation fallback")

    @property
    def allowed_extensions_list(self) -> list[str]:
        """Returns the allowed extensions string parsed into a list."""
        return [ext.strip().lower() for ext in self.ALLOWED_EXTENSIONS.split(",")]


# Global Settings Instance
settings = Settings()
