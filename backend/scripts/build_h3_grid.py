"""Build daily H3 fire aggregates from standardized observation data."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import polars as pl

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.spatial import (
    AggregationValidation,
    H3_RESOLUTION,
    aggregate_daily_h3,
    ensure_valid_aggregation,
    validate_aggregation,
    validate_h3_cell_resolution,
)

logger = logging.getLogger(__name__)
INPUT_PATH = BACKEND_ROOT / "data" / "processed" / "standardized_fires.parquet"
OUTPUT_PATH = BACKEND_ROOT / "data" / "processed" / "h3_fire_daily.parquet"


def build_h3_grid(
    input_path: str | Path = INPUT_PATH,
    output_path: str | Path = OUTPUT_PATH,
    resolution: int = H3_RESOLUTION,
) -> tuple[pl.DataFrame, AggregationValidation]:
    """Read standardized observations, aggregate them, validate, and write Parquet."""
    input_path = Path(input_path).resolve()
    output_path = Path(output_path).resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"Standardized fire dataset not found: {input_path}")

    observations = pl.read_parquet(input_path)
    input_count = observations.height
    aggregated = aggregate_daily_h3(observations, resolution)
    validation = validate_aggregation(aggregated, input_count)
    ensure_valid_aggregation(validation)
    if not validate_h3_cell_resolution(aggregated, resolution):
        raise ValueError(f"Found an H3 cell that is not at resolution {resolution}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    aggregated.write_parquet(output_path, compression="zstd")
    date_range = observations.select(
        pl.col("acq_date").min().alias("first"), pl.col("acq_date").max().alias("last")
    ).row(0)
    logger.info(
        "H3 aggregation complete: input_records=%d output_rows=%d h3_resolution=%d "
        "unique_h3_cells=%d date_range=%s to %s output=%s",
        input_count, validation.output_rows, resolution, validation.unique_h3_cells,
        date_range[0], date_range[1], output_path,
    )
    logger.info(
        "Sensor counts: MODIS=%d VIIRS=%d; validation=%s",
        observations.filter(pl.col("sensor") == "MODIS").height,
        observations.filter(pl.col("sensor") == "VIIRS").height,
        validation,
    )
    return aggregated, validation


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    build_h3_grid()


if __name__ == "__main__":
    main()
