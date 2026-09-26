"""Build and validate the TerraIgnis relative Burn Index."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import polars as pl

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.burn_index import (
    BurnIndexValidation,
    build_burn_index as create_burn_index,
    ensure_valid_burn_index,
    inspect_harmonized_data,
    validate_burn_index,
)

logger = logging.getLogger(__name__)
INPUT_PATH = BACKEND_ROOT / "data" / "processed" / "harmonized_fire.parquet"
OUTPUT_PATH = BACKEND_ROOT / "data" / "processed" / "burn_index.parquet"


def build_burn_index(
    input_path: str | Path = INPUT_PATH,
    output_path: str | Path = OUTPUT_PATH,
) -> tuple[pl.DataFrame, BurnIndexValidation]:
    """Inspect harmonized input, build the index, validate, and save Parquet."""
    input_path = Path(input_path).resolve()
    output_path = Path(output_path).resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"Harmonized fire data not found: {input_path}")

    source = pl.read_parquet(input_path)
    inspection = inspect_harmonized_data(source)
    output = create_burn_index(source)
    validation = validate_burn_index(source, output)
    ensure_valid_burn_index(validation)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.write_parquet(output_path, compression="zstd")
    logger.info(
        "Burn Index complete: rows=%d cells=%d dates=%d (%s to %s) "
        "sensor_presence=%s output=%s",
        inspection.rows, inspection.unique_h3_cells, inspection.unique_dates,
        inspection.first_date, inspection.last_date, inspection.sensor_presence, output_path,
    )
    logger.info(
        "Burn Index distribution (0–100): min=%.3f mean=%.3f median=%.3f p95=%.3f max=%.3f",
        output["burn_index"].min(), output["burn_index"].mean(),
        output["burn_index"].median(), output["burn_index"].quantile(0.95),
        output["burn_index"].max(),
    )
    logger.info("Validation: %s", validation)
    return output, validation


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    build_burn_index()


if __name__ == "__main__":
    main()
