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

FIRMS_PRODUCTS = {
    "MODIS_NRT",
    "VIIRS_SNPP_NRT",
    "VIIRS_NOAA20_NRT",
    "VIIRS_NOAA21_NRT",
    "MODIS_SP",
    "VIIRS_SNPP_SP",
    "VIIRS_NOAA20_SP",
    "VIIRS_NOAA21_SP",
}


def _env_bool(values: Mapping[str, str], name: str, default: bool) -> bool:
    raw = values.get(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false.")


def _source_list(values: Mapping[str, str], name: str, defaults: tuple[str, ...]) -> tuple[str, ...]:
    raw = values.get(name)
    sources = tuple(item.strip().upper() for item in raw.split(",") if item.strip()) if raw is not None else defaults
    unknown = sorted(set(sources).difference(FIRMS_PRODUCTS))
    if unknown:
        raise ValueError(f"{name} contains unsupported FIRMS products: {', '.join(unknown)}")
    if not sources:
        raise ValueError(f"{name} must include at least one FIRMS product.")
    return tuple(dict.fromkeys(sources))


@dataclass(frozen=True)
class Settings:
    """Resolved application environment and processed data directory."""

    app_env: str
    data_dir: Path
    cors_origins: tuple[str, ...]
    firms_map_key: str = ""
    firms_nrt_enabled: bool = False
    firms_nrt_interval_minutes: int = 30
    firms_nrt_lookback_days: int = 3
    firms_nrt_sources: tuple[str, ...] = (
        "MODIS_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"
    )
    firms_historical_enabled: bool = False
    firms_historical_start_date: str = ""
    firms_historical_end_date: str = ""
    firms_historical_chunk_days: int = 5
    firms_historical_sources: tuple[str, ...] = (
        "MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP", "VIIRS_NOAA21_SP"
    )
    firms_request_timeout: float = 60.0
    firms_max_retries: int = 5
    firms_retry_backoff_seconds: float = 2.0
    firms_geographic_scope: str = "world"
    firms_ingestion_token: str = ""

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
        nrt_interval = int(values.get("FIRMS_NRT_INTERVAL_MINUTES", "30"))
        nrt_lookback = int(values.get("FIRMS_NRT_LOOKBACK_DAYS", "3"))
        history_chunk = int(values.get("FIRMS_HISTORICAL_CHUNK_DAYS", "5"))
        timeout = float(values.get("FIRMS_REQUEST_TIMEOUT", "60"))
        retries = int(values.get("FIRMS_MAX_RETRIES", "5"))
        backoff = float(values.get("FIRMS_RETRY_BACKOFF_SECONDS", "2"))
        if nrt_interval < 1 or nrt_lookback < 1 or nrt_lookback > 5:
            raise ValueError("FIRMS NRT interval must be positive and lookback must be between 1 and 5 days.")
        if history_chunk < 1 or history_chunk > 5:
            raise ValueError("FIRMS_HISTORICAL_CHUNK_DAYS must be between 1 and 5.")
        if timeout <= 0 or retries < 0 or backoff < 0:
            raise ValueError("FIRMS timeout must be positive and retry/backoff values cannot be negative.")
        geographic_scope = values.get("FIRMS_GEOGRAPHIC_SCOPE", "world").strip() or "world"
        if geographic_scope.lower() != "world":
            try:
                bounds = [float(part.strip()) for part in geographic_scope.split(",")]
            except ValueError as exc:
                raise ValueError("FIRMS_GEOGRAPHIC_SCOPE must be 'world' or west,south,east,north.") from exc
            if len(bounds) != 4:
                raise ValueError("FIRMS_GEOGRAPHIC_SCOPE must be 'world' or west,south,east,north.")
            west, south, east, north = bounds
            if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
                raise ValueError("FIRMS_GEOGRAPHIC_SCOPE bounds are outside valid geographic ranges.")
        nrt_sources = _source_list(
            values, "FIRMS_NRT_SOURCES",
            ("MODIS_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT"),
        )
        historical_sources = _source_list(
            values, "FIRMS_HISTORICAL_SOURCES",
            ("MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP", "VIIRS_NOAA21_SP"),
        )
        if any(not source.endswith("_NRT") for source in nrt_sources):
            raise ValueError("FIRMS_NRT_SOURCES may only include NRT products.")
        if any(not source.endswith("_SP") for source in historical_sources):
            raise ValueError("FIRMS_HISTORICAL_SOURCES may only include Standard Processing products.")
        return cls(
            app_env=values.get("APP_ENV", "development").strip().lower() or "development",
            # Keep a configured directory symlink (the pipeline's atomically
            # switched `data/processed` link) intact. Resolving it here pins
            # this process to the generation that was active at startup.
            data_dir=data_dir.absolute(),
            cors_origins=origins,
            firms_map_key=values.get("FIRMS_MAP_KEY", "").strip(),
            firms_nrt_enabled=_env_bool(values, "FIRMS_NRT_ENABLED", False),
            firms_nrt_interval_minutes=nrt_interval,
            firms_nrt_lookback_days=nrt_lookback,
            firms_nrt_sources=nrt_sources,
            firms_historical_enabled=_env_bool(values, "FIRMS_HISTORICAL_ENABLED", False),
            firms_historical_start_date=values.get("FIRMS_HISTORICAL_START_DATE", "").strip(),
            firms_historical_end_date=values.get("FIRMS_HISTORICAL_END_DATE", "").strip(),
            firms_historical_chunk_days=history_chunk,
            firms_historical_sources=historical_sources,
            firms_request_timeout=timeout,
            firms_max_retries=retries,
            firms_retry_backoff_seconds=backoff,
            firms_geographic_scope=geographic_scope,
            firms_ingestion_token=values.get("FIRMS_INGESTION_TOKEN", "").strip(),
        )

    def dataset_path(self, name: str) -> Path:
        """Return the centralized path for a known processed Parquet dataset."""
        try:
            filename = DATASET_FILENAMES[name]
        except KeyError as exc:
            raise ValueError(f"Unknown processed dataset: {name}") from exc
        return self.data_dir / filename


settings = Settings.from_env()
