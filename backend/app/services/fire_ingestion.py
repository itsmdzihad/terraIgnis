"""Ingest and standardize raw NASA FIRMS active-fire CSV files."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

import polars as pl

logger = logging.getLogger(__name__)
Sensor = Literal["MODIS", "VIIRS"]

STANDARD_COLUMNS = [
    "record_id", "sensor", "satellite", "latitude", "longitude", "acq_date",
    "acq_time", "brightness", "brightness_longwave", "scan", "track",
    "confidence_raw", "confidence_numeric", "frp", "daynight", "version",
    "source_file",
]

STANDARD_SCHEMA: dict[str, pl.DataType] = {
    "record_id": pl.String,
    "sensor": pl.String,
    "satellite": pl.String,
    "latitude": pl.Float64,
    "longitude": pl.Float64,
    "acq_date": pl.Date,
    "acq_time": pl.String,
    "brightness": pl.Float64,
    "brightness_longwave": pl.Float64,
    "scan": pl.Float64,
    "track": pl.Float64,
    "confidence_raw": pl.String,
    "confidence_numeric": pl.Float64,
    "frp": pl.Float64,
    "daynight": pl.String,
    "version": pl.String,
    "source_file": pl.String,
}

MODIS_REQUIRED = {
    "latitude", "longitude", "brightness", "scan", "track", "acq_date",
    "acq_time", "satellite", "confidence", "version", "bright_t31", "frp", "daynight",
}
VIIRS_REQUIRED = {
    "latitude", "longitude", "bright_ti4", "scan", "track", "acq_date",
    "acq_time", "satellite", "confidence", "version", "bright_ti5", "frp", "daynight",
}


@dataclass
class ValidationReport:
    """Validation counts and per-record rule violations; invalid rows are retained."""

    total_records: int
    valid_records: int
    invalid_records: int
    validation_errors: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class IngestionResult:
    """Summary returned by :func:`ingest_fire_data`."""

    modis_files: int
    viirs_files: int
    modis_records: int
    viirs_records: int
    total_records: int
    invalid_records: int
    output_file: str
    errors: list[dict[str, str]] = field(default_factory=list)
    validation: ValidationReport | None = None


def _default_data_root() -> Path:
    """Return the backend data directory, independent of the caller's cwd."""
    return Path(__file__).resolve().parents[2] / "data"


def discover_files(data_root: str | Path | None = None) -> dict[Sensor, list[Path]]:
    """Find all raw MODIS and VIIRS .txt files under the given data root."""
    root = Path(data_root) if data_root is not None else _default_data_root()
    return {
        "MODIS": sorted((root / "raw" / "modis").glob("*.txt")),
        "VIIRS": sorted((root / "raw" / "viirs").glob("*.txt")),
    }


def _read_file(path: str | Path, expected_columns: set[str]) -> pl.DataFrame:
    """Read one FIRMS CSV as strings so normalization controls all type parsing."""
    path = Path(path)
    frame = pl.read_csv(
        path,
        separator=",",
        encoding="utf8",
        infer_schema=False,
        null_values=["", "null", "NULL", "NA"],
        ignore_errors=False,
        truncate_ragged_lines=False,
        try_parse_dates=False,
    )
    # Trim incidental whitespace but preserve the actual confidence token/value.
    frame = frame.rename({col: col.strip() for col in frame.columns})
    frame = frame.with_columns(
        pl.col(col).str.strip_chars().replace("", None).alias(col)
        for col, dtype in frame.schema.items()
        if dtype == pl.String and col != "confidence"
    )
    missing = sorted(expected_columns.difference(frame.columns))
    if missing:
        raise ValueError(f"missing required FIRMS columns: {', '.join(missing)}")
    return frame


def read_modis_file(path: str | Path) -> pl.DataFrame:
    """Read a MODIS FIRMS .txt CSV file."""
    return _read_file(path, MODIS_REQUIRED)


def read_viirs_file(path: str | Path) -> pl.DataFrame:
    """Read a VIIRS FIRMS .txt CSV file."""
    return _read_file(path, VIIRS_REQUIRED)


def _parse_date(column: str) -> pl.Expr:
    value = pl.col(column).str.strip_chars()
    return pl.coalesce(
        value.str.strptime(pl.Date, format="%Y-%m-%d", strict=False),
        value.str.strptime(pl.Date, format="%Y/%m/%d", strict=False),
    )


def _record_id(sensor: Sensor, path: Path, row_position: int) -> str:
    # Include sensor and filename to keep IDs stable and distinct for same-named files.
    key = f"{sensor}/{path.name}:{row_position}".encode("utf-8")
    return hashlib.sha256(key).hexdigest()


def _normalize(frame: pl.DataFrame, sensor: Sensor, path: str | Path) -> pl.DataFrame:
    path = Path(path)
    if sensor == "MODIS":
        brightness, longwave = "brightness", "bright_t31"
    else:
        brightness, longwave = "bright_ti4", "bright_ti5"

    frame = frame.with_row_index("_row_position")
    result = frame.select(
        pl.col("_row_position").map_elements(
            lambda i: _record_id(sensor, path, int(i)), return_dtype=pl.String
        ).alias("record_id"),
        pl.lit(sensor).alias("sensor"),
        pl.col("satellite").cast(pl.String).alias("satellite"),
        pl.col("latitude").cast(pl.Float64, strict=False).alias("latitude"),
        pl.col("longitude").cast(pl.Float64, strict=False).alias("longitude"),
        _parse_date("acq_date").alias("acq_date"),
        pl.col("acq_time").cast(pl.String).alias("acq_time"),
        pl.col(brightness).cast(pl.Float64, strict=False).alias("brightness"),
        pl.col(longwave).cast(pl.Float64, strict=False).alias("brightness_longwave"),
        pl.col("scan").cast(pl.Float64, strict=False).alias("scan"),
        pl.col("track").cast(pl.Float64, strict=False).alias("track"),
        pl.col("confidence").cast(pl.String).alias("confidence_raw"),
        (pl.col("confidence").cast(pl.Float64, strict=False)
         if sensor == "MODIS" else pl.lit(None, dtype=pl.Float64)).alias("confidence_numeric"),
        pl.col("frp").cast(pl.Float64, strict=False).alias("frp"),
        pl.col("daynight").cast(pl.String).str.to_uppercase().alias("daynight"),
        pl.col("version").cast(pl.String).alias("version"),
        pl.lit(path.name).alias("source_file"),
    )
    return _cast_standard_schema(result)


def _cast_standard_schema(frame: pl.DataFrame) -> pl.DataFrame:
    """Ensure exact standardized columns, order, and types."""
    expressions = []
    for name, dtype in STANDARD_SCHEMA.items():
        if name in frame.columns:
            expressions.append(pl.col(name).cast(dtype, strict=False).alias(name))
        else:
            expressions.append(pl.lit(None, dtype=dtype).alias(name))
    return frame.select(expressions)


def normalize_modis(frame: pl.DataFrame, source_file: str | Path) -> pl.DataFrame:
    """Map MODIS fields to the shared schema, including numeric confidence."""
    return _normalize(frame, "MODIS", source_file)


def normalize_viirs(frame: pl.DataFrame, source_file: str | Path) -> pl.DataFrame:
    """Map VIIRS fields to the shared schema; categorical confidence stays raw."""
    return _normalize(frame, "VIIRS", source_file)


def validate_fire_data(frame: pl.DataFrame) -> ValidationReport:
    """Check standardized records and return violations without dropping any rows."""
    if frame.is_empty():
        return ValidationReport(0, 0, 0, [])
    checks = [
        (pl.col("latitude").is_null() | ~pl.col("latitude").is_between(-90, 90, closed="both"), "latitude must be present and between -90 and 90"),
        (pl.col("longitude").is_null() | ~pl.col("longitude").is_between(-180, 180, closed="both"), "longitude must be present and between -180 and 180"),
        (pl.col("acq_date").is_null(), "acq_date is missing or invalid"),
        (pl.col("frp").is_null() | (pl.col("frp") < 0), "frp must be present and >= 0"),
        (pl.col("scan").is_null() | (pl.col("scan") <= 0), "scan must be > 0"),
        (pl.col("track").is_null() | (pl.col("track") <= 0), "track must be > 0"),
        (pl.col("daynight").is_null() | ~pl.col("daynight").is_in(["D", "N"]), "daynight must be D or N"),
        ((pl.col("sensor") == "MODIS") & (pl.col("confidence_numeric").is_null() | ~pl.col("confidence_numeric").is_between(0, 100, closed="both")), "MODIS confidence must be numeric and within 0-100"),
        ((pl.col("sensor") == "VIIRS") & ~pl.col("confidence_raw").str.to_lowercase().is_in(["low", "nominal", "high"]), "VIIRS confidence must be low, nominal, or high"),
    ]
    violations = frame.select(
        "record_id", "sensor", "source_file", "latitude", "longitude", "acq_date", "frp",
        *[condition.fill_null(True).alias(f"_error_{i}") for i, (condition, _) in enumerate(checks)],
    )
    details: list[dict[str, Any]] = []
    for row in violations.iter_rows(named=True):
        messages = [message for i, (_, message) in enumerate(checks) if row[f"_error_{i}"]]
        if messages:
            details.append({
                "record_id": row["record_id"], "sensor": row["sensor"],
                "source_file": row["source_file"], "latitude": row["latitude"],
                "longitude": row["longitude"], "acq_date": row["acq_date"],
                "frp": row["frp"], "errors": messages,
            })
    invalid = len(details)
    return ValidationReport(frame.height, frame.height - invalid, invalid, details)


def save_standardized_data(frame: pl.DataFrame, output_file: str | Path | None = None) -> Path:
    """Write standardized records as zstd-compressed Parquet, creating parents."""
    path = Path(output_file) if output_file is not None else _default_data_root() / "processed" / "standardized_fires.parquet"
    path.parent.mkdir(parents=True, exist_ok=True)
    _cast_standard_schema(frame).write_parquet(path, compression="zstd")
    return path


def ingest_fire_data(
    data_root: str | Path | None = None,
    output_file: str | Path | None = None,
) -> IngestionResult:
    """Read, normalize, validate, combine, and save all FIRMS files found."""
    root = Path(data_root) if data_root is not None else _default_data_root()
    files = discover_files(root)
    errors: list[dict[str, str]] = []
    frames: dict[Sensor, list[pl.DataFrame]] = {"MODIS": [], "VIIRS": []}
    record_counts: dict[Sensor, int] = {"MODIS": 0, "VIIRS": 0}

    for sensor in ("MODIS", "VIIRS"):
        for path in files[sensor]:
            try:
                raw = read_modis_file(path) if sensor == "MODIS" else read_viirs_file(path)
                normalized = normalize_modis(raw, path) if sensor == "MODIS" else normalize_viirs(raw, path)
                frames[sensor].append(normalized)
                record_counts[sensor] += normalized.height
            except Exception as exc:
                logger.exception("Could not ingest FIRMS file %s", path)
                errors.append({"file": str(path), "error": str(exc)})

    all_frames = frames["MODIS"] + frames["VIIRS"]
    combined = pl.concat(all_frames, how="vertical") if all_frames else pl.DataFrame(schema=STANDARD_SCHEMA)
    combined = _cast_standard_schema(combined).sort(["acq_date", "acq_time", "sensor"], nulls_last=True)
    validation = validate_fire_data(combined)
    target = Path(output_file) if output_file is not None else root / "processed" / "standardized_fires.parquet"
    saved_path = save_standardized_data(combined, target)
    result = IngestionResult(
        modis_files=len(files["MODIS"]), viirs_files=len(files["VIIRS"]),
        modis_records=record_counts["MODIS"], viirs_records=record_counts["VIIRS"],
        total_records=combined.height, invalid_records=validation.invalid_records,
        output_file=str(saved_path), errors=errors, validation=validation,
    )
    logger.info(
        "FIRMS ingestion complete: MODIS files=%d records=%d; VIIRS files=%d records=%d; "
        "total=%d invalid=%d output=%s file_errors=%d",
        result.modis_files, result.modis_records, result.viirs_files, result.viirs_records,
        result.total_records, result.invalid_records, result.output_file, len(result.errors),
    )
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    logger.info("Ingestion result: %s", asdict(ingest_fire_data()))
