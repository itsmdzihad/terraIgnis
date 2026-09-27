"""Environment-backed application settings and processed dataset paths."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")

DATASET_FILENAMES = {
    "standardized_fires": "standardized_fires.parquet",
    "h3_fire_daily": "h3_fire_daily.parquet",
    "harmonized_fire": "harmonized_fire.parquet",
    "burn_index": "burn_index.parquet",
    "anomalies": "anomalies.parquet",
}


@dataclass(frozen=True)
class Settings:
    """Resolved application environment and processed data directory."""

    app_env: str
    data_dir: Path
    cors_origins: tuple[str, ...]

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> Settings:
        """Build settings from environment variables, resolving relative paths at backend root."""
        values = os.environ if environ is None else environ
        raw_data_dir = Path(values.get("DATA_DIR", "data/processed")).expanduser()
        data_dir = raw_data_dir if raw_data_dir.is_absolute() else BACKEND_ROOT / raw_data_dir
        origins = tuple(
            origin.strip()
            for origin in values.get(
                "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
            ).split(",")
            if origin.strip()
        )
        return cls(
            app_env=values.get("APP_ENV", "development").strip().lower() or "development",
            data_dir=data_dir.resolve(),
            cors_origins=origins,
        )

    def dataset_path(self, name: str) -> Path:
        """Return the centralized path for a known processed Parquet dataset."""
        try:
            filename = DATASET_FILENAMES[name]
        except KeyError as exc:
            raise ValueError(f"Unknown processed dataset: {name}") from exc
        return self.data_dir / filename


settings = Settings.from_env()
