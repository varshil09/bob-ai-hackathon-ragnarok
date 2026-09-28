"""
CHAKRA — Configuration
Loads environment variables with sane defaults for local dev.
"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


# Resolve paths relative to this file so it works from any cwd
BACKEND_DIR = Path(__file__).resolve().parent
ENV_FILE = BACKEND_DIR.parent / ".env"   # src/.env


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        env_prefix="CHAKRA_",
        extra="ignore",
    )

    # Server
    host: str = "127.0.0.1"
    port: int = 8000
    debug: bool = True

    # Data
    dataset_path: str = "data/fir_dataset.csv"
    db_path: str = "data/chakra.db"

    # Bob
    use_mock_bob: bool = True

    # Bob Inference API
    bob_api_key:  str = ""
    bob_base_url: str = "https://api.us-east.bob.ibm.com/inference/v1"
    bob_model_id: str = "premium"


    # CORS — comma-separated in .env, split at load
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000"

    # ---- Derived helpers ----
    @property
    def dataset_full_path(self) -> Path:
        return BACKEND_DIR / self.dataset_path

    @property
    def db_full_path(self) -> Path:
        return BACKEND_DIR / self.db_path

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


# Singleton
settings = Settings()