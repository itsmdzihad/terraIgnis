"""Lightweight summary statistics read from processed Parquet datasets."""

from __future__ import annotations

import h3
from fastapi import APIRouter

from app.core.database import fetch_one, fetch_scalar, get_dataset_path
from app.schemas.stats import (
    AnomalyStatistics,
    BurnIndexStatistics,
    CoverageStatistics,
    SensorStatistics,
    StatsResponse,
)

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=StatsResponse)
def get_stats() -> StatsResponse:
    """Return coverage, sensor, Burn Index, and anomaly counts from existing datasets."""
    raw_path = get_dataset_path("standardized_fires")
    h3_path = get_dataset_path("h3_fire_daily")
    harmonized_path = get_dataset_path("harmonized_fire")
    burn_path = get_dataset_path("burn_index")
    anomaly_path = get_dataset_path("anomalies")

    raw = fetch_one(
        "SELECT count(*) AS total_raw_observations, "
        "count(*) FILTER (WHERE sensor = 'MODIS') AS modis_observations, "
        "count(*) FILTER (WHERE sensor = 'VIIRS') AS viirs_observations "
        "FROM read_parquet(?)",
        [raw_path],
    )
    coverage = fetch_one(
        "SELECT count(*) AS total_h3_cell_dates, "
        "count(DISTINCT h3_cell) AS unique_h3_cells, "
        "count(DISTINCT acq_date) AS observed_dates, "
        "min(acq_date) AS start_date, max(acq_date) AS end_date "
        "FROM read_parquet(?)",
        [h3_path],
    )
    sensor_presence = fetch_one(
        "SELECT count(*) FILTER (WHERE sensor_presence = 'MODIS') AS modis_only_cell_dates, "
        "count(*) FILTER (WHERE sensor_presence = 'VIIRS') AS viirs_only_cell_dates, "
        "count(*) FILTER (WHERE sensor_presence = 'MODIS+VIIRS') AS both_sensor_cell_dates "
        "FROM read_parquet(?)",
        [harmonized_path],
    )
    burn = fetch_one(
        "SELECT min(burn_index) AS minimum, max(burn_index) AS maximum, "
        "avg(burn_index) AS mean, median(burn_index) AS median, "
        "quantile_cont(burn_index, 0.95) AS p95 FROM read_parquet(?)",
        [burn_path],
    )
    anomaly = fetch_one(
        "SELECT count(*) FILTER (WHERE anomaly_level = 'normal') AS normal, "
        "count(*) FILTER (WHERE anomaly_level = 'low') AS low, "
        "count(*) FILTER (WHERE anomaly_level = 'high') AS high, "
        "count(*) FILTER (WHERE anomaly_level = 'extreme_low') AS extreme_low, "
        "count(*) FILTER (WHERE anomaly_level = 'extreme_high') AS extreme_high "
        "FROM read_parquet(?)",
        [anomaly_path],
    )
    sample_cell = fetch_scalar("SELECT h3_cell FROM read_parquet(?) LIMIT 1", [h3_path])

    anomalous_count = sum(
        int(anomaly[level]) for level in ("low", "high", "extreme_low", "extreme_high")
    )
    return StatsResponse(
        coverage=CoverageStatistics(
            total_raw_observations=int(raw["total_raw_observations"]),
            total_h3_cell_dates=int(coverage["total_h3_cell_dates"]),
            unique_h3_cells=int(coverage["unique_h3_cells"]),
            observed_dates=int(coverage["observed_dates"]),
            start_date=coverage["start_date"],
            end_date=coverage["end_date"],
            h3_resolution=h3.get_resolution(sample_cell) if sample_cell else None,
        ),
        sensors=SensorStatistics(**{
            name: int(raw[name]) for name in ("modis_observations", "viirs_observations")
        }, **{
            name: int(sensor_presence[name])
            for name in ("modis_only_cell_dates", "viirs_only_cell_dates", "both_sensor_cell_dates")
        }),
        burn_index=BurnIndexStatistics(**burn),
        anomalies=AnomalyStatistics(
            normal=int(anomaly["normal"]),
            low=int(anomaly["low"]),
            high=int(anomaly["high"]),
            extreme_low=int(anomaly["extreme_low"]),
            extreme_high=int(anomaly["extreme_high"]),
            total_anomalous=anomalous_count,
        ),
    )
