"""Build daily robust anomaly indicators from Burn Index observations."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import polars as pl

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.anomaly import (
    AnomalyValidation,
    build_anomaly_dataset,
    ensure_valid_anomalies,
    inspect_burn_index_data,
    validate_anomalies,
)

logger = logging.getLogger(__name__)
INPUT_PATH = BACKEND_ROOT / "data" / "processed" / "burn_index.parquet"
OUTPUT_PATH = BACKEND_ROOT / "data" / "processed" / "anomalies.parquet"


def build_anomalies(
    input_path: str | Path = INPUT_PATH,
    output_path: str | Path = OUTPUT_PATH,
) -> tuple[pl.DataFrame, AnomalyValidation]:
    """Read Burn Index rows, build date-relative scores, validate, and save."""
    input_path = Path(input_path).resolve()
    output_path = Path(output_path).resolve()
    if not input_path.is_file():
        raise FileNotFoundError(f"Burn Index data not found: {input_path}")

    source = pl.read_parquet(input_path)
    inspection = inspect_burn_index_data(source)
    output = build_anomaly_dataset(source)
    validation = validate_anomalies(source, output)
    ensure_valid_anomalies(validation)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.write_parquet(output_path, compression="zstd")
    levels = output.group_by("anomaly_level").len().sort("anomaly_level").to_dicts()
    logger.info(
        "Anomaly build complete: rows=%d cells=%d dates=%d (%s to %s) "
        "daily_counts=%s output=%s",
        inspection.rows, inspection.unique_h3_cells, inspection.unique_dates,
        inspection.first_date, inspection.last_date,
        inspection.daily_observation_counts, output_path,
    )
    logger.info("Anomaly levels: %s", levels)
    logger.info("Baseline methods: %s; validation: %s", validation.baseline_methods, validation)
    return output, validation


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    build_anomalies()


if __name__ == "__main__":
    main()
