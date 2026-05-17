"""
second_brain/config.py
──────────────────────
Single source of truth for every config value.
Pydantic-settings reads from environment variables OR a .env file automatically.

Phase 1 settings: Redis, Storage, API, OCR, Watcher
Phase 2 settings: Neo4j, Qdrant, Embeddings, Summariser
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

    # ── LLM Keys ──────────────────────────────────────────────
    anthropic_api_key: str = Field("", alias="ANTHROPIC_API_KEY")
    openai_api_key: str = Field("", alias="OPENAI_API_KEY")

    # ── OCR ───────────────────────────────────────────────────
    tesseract_cmd: str = Field("", alias="TESSERACT_CMD")

    # ── Watcher ───────────────────────────────────────────────
    watch_folder: Path = Field(Path("./watched_inbox"), alias="WATCH_FOLDER")
    whisper_model: str = Field("base", alias="WHISPER_MODEL")

    # ── Neo4j (Phase 2 — graph database) ──────────────────────
    neo4j_uri: str = Field("bolt://localhost:7687", alias="NEO4J_URI")
    neo4j_user: str = Field("neo4j", alias="NEO4J_USER")
    neo4j_password: str = Field("secondbrain", alias="NEO4J_PASSWORD")

    # ── Qdrant (Phase 2 — vector store) ───────────────────────
    qdrant_url: str = Field("http://localhost:6333", alias="QDRANT_URL")
    qdrant_collection: str = Field("second_brain_items", alias="QDRANT_COLLECTION")

    # ── Embeddings (Phase 2) ──────────────────────────────────
    embedding_model: str = Field("text-embedding-3-small", alias="EMBEDDING_MODEL")
    embedding_dim: int = Field(1536, alias="EMBEDDING_DIM")

    # ── Summariser LLM (Phase 2) ──────────────────────────────
    summariser_provider: str = Field("openai", alias="SUMMARISER_PROVIDER")  # openai | anthropic
    summariser_model: str = Field("gpt-4o-mini", alias="SUMMARISER_MODEL")

    model_config = {"env_file": ".env", "populate_by_name": True}

    def ensure_dirs(self):
        """Create required directories if they don't exist."""
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.watch_folder.mkdir(parents=True, exist_ok=True)


# Global singleton — import this everywhere
settings = Settings()
