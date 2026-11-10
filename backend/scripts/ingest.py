"""Ingest and standardize all NASA FIRMS files in the backend data folder."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.fire_ingestion import ingest_fire_data

logger = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = ingest_fire_data()

    if result.errors:
        error_summary = "; ".join(
            f"{Path(error['file']).name}: {error['error']}" for error in result.errors
        )
        raise RuntimeError(f"Some FIRMS files could not be ingested: {error_summary}")
    if result.total_records == 0:
        raise RuntimeError("No FIRMS observations were ingested; check the raw MODIS and VIIRS files.")

    logger.info(
        "Standardized %d observations from %d MODIS and %d VIIRS files into %s",
        result.total_records,
        result.modis_files,
        result.viirs_files,
        result.output_file,
    )


if __name__ == "__main__":
    main()
