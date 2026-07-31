"""
E-Rakshak configuration management.
Defines system settings using Pydantic Settings v2.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    # Security Configs
    API_KEY_SECRET: str = Field(default="change-this-to-a-secure-random-key-in-production")

    # Database Settings
    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/erakshak"
    )
    SYNC_DATABASE_URL: str = Field(
        default="postgresql+psycopg2://postgres:postgres@localhost:5432/erakshak"
    )

    # Storage Settings
    UPLOAD_DIR: str = Field(default="./uploads")
    MAX_CONTENT_LENGTH_MB: int = Field(default=100)
    ALLOWED_EXTENSIONS: str = Field(default="csv,xlsx,xls,txt,docx,pdf")

    @property
    def allowed_extensions_list(self) -> list[str]:
        """Returns the allowed extensions string parsed into a list."""
        return [ext.strip().lower() for ext in self.ALLOWED_EXTENSIONS.split(",")]


# Global Settings Instance
settings = Settings()
