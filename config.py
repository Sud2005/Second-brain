"""
second_brain/config.py
──────────────────────
Single source of truth for every config value.
Pydantic-settings reads from environment variables OR a .env file automatically.
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from pathlib import Path


class Settings(BaseSettings):
    # ── Redis ─────────────────────────────────────────────────
    redis_url: str = Field("redis://localhost:6379/0", alias="REDIS_URL")

    # ── Storage ───────────────────────────────────────────────
    storage_path: Path = Field(Path("./storage/uploads"), alias="STORAGE_PATH")

    # ── API ───────────────────────────────────────────────────
    api_host: str = Field("0.0.0.0", alias="API_HOST")
    api_port: int = Field(8000, alias="API_PORT")
    api_secret_key: str = Field("dev-secret", alias="API_SECRET_KEY")

    # ── LLM Keys (Phase 2) ────────────────────────────────────
    anthropic_api_key: str = Field("", alias="ANTHROPIC_API_KEY")
    openai_api_key: str = Field("", alias="OPENAI_API_KEY")

    # ── OCR ───────────────────────────────────────────────────
    tesseract_cmd: str = Field("", alias="TESSERACT_CMD")

    # ── Watcher ───────────────────────────────────────────────
    watch_folder: Path = Field(Path("./watched_inbox"), alias="WATCH_FOLDER")
    whisper_model: str = Field("base", alias="WHISPER_MODEL")

    model_config = {"env_file": ".env", "populate_by_name": True}

    def ensure_dirs(self):
        """Create required directories if they don't exist."""
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.watch_folder.mkdir(parents=True, exist_ok=True)


# Global singleton — import this everywhere
settings = Settings()
