"""Build a sensor-preserving harmonized daily H3 dataset."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import polars as pl

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.harmonization import (
    HarmonizationValidation,
    build_harmonized_dataset,
    ensure_valid_harmonization,
    inspect_h3_data,
    validate_harmonized_dataset,
)

logger = logging.getLogger(__name__)
INPUT_PATH = BACKEND_ROOT / "data" / "processed" / "h3_fire_daily.parquet"
OUTPUT_PATH = BACKEND_ROOT / "data" / "processed" / "harmonized_fire.parquet"


def build_harmonized_fire(
    input_path: str | Path = INPUT_PATH,
    output_path: str | Path = OUTPUT_PATH,
) -> tuple[pl.DataFrame, HarmonizationValidation]:
    """Read H3 daily data, inspect it, normalize metrics, validate, and save."""
    input_path = Path(input_path).resolve()
    output_path = Path(output_path).resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"H3 daily dataset not found: {input_path}")

    source = pl.read_parquet(input_path)
    inspection = inspect_h3_data(source)
    output = build_harmonized_dataset(source)
    validation = validate_harmonized_dataset(source, output)
    ensure_valid_harmonization(validation)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.write_parquet(output_path, compression="zstd")
    logger.info(
        "Harmonization complete: input_rows=%d output_rows=%d h3_cells=%d dates=%s to %s "
        "MODIS_only=%d VIIRS_only=%d both=%d output=%s",
        inspection.rows, output.height, inspection.unique_h3_cells,
        inspection.first_date, inspection.last_date,
        inspection.sensor_presence["modis_only"], inspection.sensor_presence["viirs_only"],
        inspection.sensor_presence["both"], output_path,
    )
    logger.info("Conservation and quality validation: %s", validation)
    logger.info("Sensor data remains provenance-preserving; harmonized metrics are unitless indices.")
    return output, validation


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    build_harmonized_fire()


if __name__ == "__main__":
    main()
