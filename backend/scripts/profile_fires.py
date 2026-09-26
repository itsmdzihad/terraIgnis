"""Profile the standardized TerraIgnis FIRMS dataset without modifying it."""

from __future__ import annotations

import json
import logging
import math
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import duckdb

logger = logging.getLogger(__name__)
BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PARQUET_PATH = BACKEND_ROOT / "data" / "processed" / "standardized_fires.parquet"
DEFAULT_REPORT_PATH = BACKEND_ROOT / "data" / "reports" / "fire_profile.json"


def get_parquet_path(path: str | Path | None = None) -> Path:
    """Resolve the input Parquet independently of the caller's working directory."""
    resolved = Path(path) if path is not None else DEFAULT_PARQUET_PATH
    if not resolved.is_absolute():
        resolved = BACKEND_ROOT / resolved
    resolved = resolved.resolve()
    if not resolved.is_file():
        raise FileNotFoundError(f"Standardized FIRMS Parquet not found: {resolved}")
    return resolved


def create_connection(parquet_path: str | Path) -> duckdb.DuckDBPyConnection:
    """Create a read-only DuckDB connection and a view over the Parquet file."""
    connection = duckdb.connect(database=":memory:", read_only=False)
    parquet_literal = str(Path(parquet_path)).replace("'", "''")
    connection.execute(f"CREATE VIEW fires AS SELECT * FROM read_parquet('{parquet_literal}')")
    return connection


def _query(connection: duckdb.DuckDBPyConnection, sql: str) -> list[dict[str, Any]]:
    cursor = connection.execute(sql)
    columns = [description[0] for description in cursor.description or []]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _one(connection: duckdb.DuckDBPyConnection, sql: str) -> dict[str, Any]:
    rows = _query(connection, sql)
    return rows[0] if rows else {}


def _native(value: Any) -> Any:
    """Convert DuckDB values to portable JSON values and normalize non-finite numbers."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        value = float(value)
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {str(key): _native(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_native(item) for item in value]
    return value


def _rows_by_sensor_stats(connection: duckdb.DuckDBPyConnection, column: str) -> list[dict[str, Any]]:
    """Compute descriptive statistics for one known numeric column by sensor."""
    return _query(connection, f"""
        SELECT sensor,
               count({column}) AS count,
               min({column}) AS min,
               max({column}) AS max,
               avg({column}) AS mean,
               median({column}) AS median,
               stddev_samp({column}) AS standard_deviation,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY {column}) AS p25,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY {column}) AS p75,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY {column}) AS p95
        FROM fires
        GROUP BY sensor
        ORDER BY sensor
    """)


def profile_overview(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    columns = len(connection.execute("DESCRIBE SELECT * FROM fires").fetchall())
    totals = _one(connection, """
        SELECT count(*) AS total_records,
               count(DISTINCT record_id) AS unique_record_ids,
               count(DISTINCT source_file) AS total_source_files,
               count(*) FILTER (WHERE sensor = 'MODIS') AS modis_records,
               count(*) FILTER (WHERE sensor = 'VIIRS') AS viirs_records
        FROM fires
    """)
    total = totals["total_records"] or 0
    totals["total_columns"] = columns
    totals["modis_percentage"] = (totals["modis_records"] * 100.0 / total) if total else 0.0
    totals["viirs_percentage"] = (totals["viirs_records"] * 100.0 / total) if total else 0.0
    return totals


def profile_temporal(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    coverage = _one(connection, """
        SELECT min(acq_date) AS minimum_date, max(acq_date) AS maximum_date,
               count(DISTINCT acq_date) AS unique_acquisition_dates
        FROM fires
    """)
    daily = _query(connection, """
        SELECT acq_date, count(*) AS records
        FROM fires GROUP BY acq_date ORDER BY acq_date
    """)
    sensor_daily = _query(connection, """
        SELECT sensor, acq_date, count(*) AS records
        FROM fires GROUP BY sensor, acq_date ORDER BY acq_date, sensor
    """)
    sensor_coverage = _query(connection, """
        SELECT sensor, min(acq_date) AS earliest_date, max(acq_date) AS latest_date,
               count(DISTINCT acq_date) AS unique_dates, count(*) AS records
        FROM fires GROUP BY sensor ORDER BY sensor
    """)
    return {
        **coverage,
        "records_per_acquisition_date": daily,
        "records_per_sensor_per_acquisition_date": sensor_daily,
        "sensor_date_ranges": sensor_coverage,
    }


def profile_sensor_distribution(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    distribution = _query(connection, """
        SELECT sensor, count(*) AS records,
               count(*) * 100.0 / nullif((SELECT count(*) FROM fires), 0) AS percentage
        FROM fires GROUP BY sensor ORDER BY sensor
    """)
    satellites = _query(connection, """
        SELECT sensor, satellite, count(*) AS records
        FROM fires GROUP BY sensor, satellite ORDER BY sensor, satellite
    """)
    return {"sensors": distribution, "satellites": satellites}


def profile_day_night(connection: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    return _query(connection, """
        SELECT sensor, daynight, count(*) AS records,
               count(*) * 100.0 / nullif(sum(count(*)) OVER (PARTITION BY sensor), 0) AS percentage
        FROM fires GROUP BY sensor, daynight ORDER BY sensor, daynight
    """)


def profile_spatial(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    overall = _one(connection, """
        SELECT min(latitude) AS minimum_latitude, max(latitude) AS maximum_latitude,
               min(longitude) AS minimum_longitude, max(longitude) AS maximum_longitude,
               count(DISTINCT (latitude, longitude)) AS unique_coordinate_pairs
        FROM fires
    """)
    by_sensor = _query(connection, """
        SELECT sensor, min(latitude) AS minimum_latitude, max(latitude) AS maximum_latitude,
               min(longitude) AS minimum_longitude, max(longitude) AS maximum_longitude,
               count(DISTINCT (latitude, longitude)) AS unique_coordinate_pairs
        FROM fires GROUP BY sensor ORDER BY sensor
    """)
    repeated = _one(connection, """
        SELECT count(*) AS unique_coordinate_pairs,
               coalesce(sum(pair_records), 0) AS records_in_repeated_coordinate_pairs,
               coalesce(max(pair_records), 0) AS maximum_records_at_one_coordinate
        FROM (
            SELECT latitude, longitude, count(*) AS pair_records
            FROM fires GROUP BY latitude, longitude
        ) pairs
    """)
    repeated["records_in_repeated_coordinate_pairs"] = _one(connection, """
        SELECT coalesce(sum(pair_records), 0) AS records_in_repeated_coordinate_pairs
        FROM (SELECT count(*) AS pair_records FROM fires GROUP BY latitude, longitude HAVING count(*) > 1)
    """)["records_in_repeated_coordinate_pairs"]
    return {"overall": overall, "by_sensor": by_sensor, "coordinate_frequency": repeated}


def profile_frp(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    by_sensor = _rows_by_sensor_stats(connection, "frp")
    totals = _query(connection, """
        SELECT sensor, sum(frp) AS total_frp, avg(frp) AS mean_frp
        FROM fires GROUP BY sensor ORDER BY sensor
    """)
    overall_total = _one(connection, "SELECT sum(frp) AS total_frp FROM fires")
    return {
        "statistics_by_sensor": by_sensor,
        "total_frp_all_sensors": overall_total["total_frp"],
        "total_and_mean_by_sensor": totals,
    }


def profile_brightness(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    return {
        column: _rows_by_sensor_stats(connection, column)
        for column in ("brightness", "brightness_longwave")
    }


def profile_scan_track(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    return {
        column: _query(connection, f"""
            SELECT sensor, min({column}) AS min, max({column}) AS max,
                   avg({column}) AS mean, median({column}) AS median
            FROM fires GROUP BY sensor ORDER BY sensor
        """)
        for column in ("scan", "track")
    }


def profile_confidence(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    modis = _one(connection, """
        SELECT min(confidence_numeric) AS min, max(confidence_numeric) AS max,
               avg(confidence_numeric) AS mean, median(confidence_numeric) AS median,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY confidence_numeric) AS p25,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY confidence_numeric) AS p75,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY confidence_numeric) AS p95
        FROM fires WHERE sensor = 'MODIS'
    """)
    modis["counts_by_value"] = _query(connection, """
        SELECT confidence_numeric AS value, count(*) AS records
        FROM fires WHERE sensor = 'MODIS' GROUP BY confidence_numeric ORDER BY confidence_numeric
    """)
    modis["counts_by_bin"] = _query(connection, """
        SELECT confidence_bin, count(*) AS records
        FROM (
            SELECT CASE
                WHEN confidence_numeric BETWEEN 0 AND 19 THEN '0-19'
                WHEN confidence_numeric BETWEEN 20 AND 39 THEN '20-39'
                WHEN confidence_numeric BETWEEN 40 AND 59 THEN '40-59'
                WHEN confidence_numeric BETWEEN 60 AND 79 THEN '60-79'
                WHEN confidence_numeric BETWEEN 80 AND 100 THEN '80-100'
                ELSE 'outside-range-or-missing'
            END AS confidence_bin
            FROM fires WHERE sensor = 'MODIS'
        ) bins GROUP BY confidence_bin ORDER BY confidence_bin
    """)
    viirs = _query(connection, """
        SELECT lower(trim(confidence_raw)) AS confidence, count(*) AS records,
               count(*) * 100.0 / nullif(sum(count(*)) OVER (), 0) AS percentage
        FROM fires WHERE sensor = 'VIIRS'
        GROUP BY lower(trim(confidence_raw)) ORDER BY confidence
    """)
    return {"MODIS": modis, "VIIRS": {"counts_and_percentages": viirs}}


def profile_nulls(connection: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    columns = [row[0] for row in connection.execute("DESCRIBE SELECT * FROM fires").fetchall()]
    result = []
    for column in columns:
        # Column identifiers come exclusively from DuckDB's schema metadata.
        quoted = '"' + column.replace('"', '""') + '"'
        stats = _one(connection, f"SELECT count(*) AS total, count(*) - count({quoted}) AS nulls FROM fires")
        stats["column"] = column
        stats["null_percentage"] = (stats["nulls"] * 100.0 / stats["total"]) if stats["total"] else 0.0
        result.append(stats)
    return result


def profile_duplicates(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    record_ids = _one(connection, """
        SELECT count(*) AS total_records, count(DISTINCT record_id) AS unique_record_ids,
               count(*) - count(DISTINCT record_id) AS duplicate_record_id_rows
        FROM fires
    """)
    record_ids["duplicate_record_ids"] = _one(connection, """
        SELECT count(*) AS duplicate_record_ids FROM (
            SELECT record_id FROM fires GROUP BY record_id HAVING count(*) > 1
        ) duplicated
    """)["duplicate_record_ids"]
    observation = _one(connection, """
        SELECT count(*) AS duplicated_combinations,
               coalesce(sum(rows_in_combination), 0) AS rows_in_duplicated_combinations
        FROM (
            SELECT count(*) AS rows_in_combination
            FROM fires
            GROUP BY sensor, latitude, longitude, acq_date, acq_time
            HAVING count(*) > 1
        ) repeated
    """)
    return {"record_id": record_ids, "potential_observation_duplicates": observation}


def profile_source_files(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    files = _query(connection, """
        SELECT sensor, source_file, count(*) AS record_count
        FROM fires GROUP BY sensor, source_file ORDER BY sensor, source_file
    """)
    summary = _query(connection, """
        SELECT sensor, count(DISTINCT source_file) AS source_files,
               min(record_count) AS minimum_records_per_file,
               max(record_count) AS maximum_records_per_file,
               avg(record_count) AS average_records_per_file
        FROM (
            SELECT sensor, source_file, count(*) AS record_count
            FROM fires GROUP BY sensor, source_file
        ) grouped GROUP BY sensor ORDER BY sensor
    """)
    return {"file_counts": files, "summary_by_sensor": summary}


def profile_versions(connection: duckdb.DuckDBPyConnection) -> list[dict[str, Any]]:
    return _query(connection, """
        SELECT sensor, version, count(*) AS records
        FROM fires GROUP BY sensor, version ORDER BY sensor, version
    """)


def profile_data_quality(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    return _one(connection, """
        SELECT count(*) FILTER (WHERE latitude < -90 OR latitude > 90) AS latitude_out_of_range,
               count(*) FILTER (WHERE longitude < -180 OR longitude > 180) AS longitude_out_of_range,
               count(*) FILTER (WHERE frp < 0) AS negative_frp,
               count(*) FILTER (WHERE scan <= 0) AS nonpositive_scan,
               count(*) FILTER (WHERE track <= 0) AS nonpositive_track,
               count(*) FILTER (WHERE daynight NOT IN ('D', 'N') OR daynight IS NULL) AS invalid_daynight,
               count(*) FILTER (WHERE sensor = 'MODIS' AND
                   (confidence_numeric IS NULL OR confidence_numeric < 0 OR confidence_numeric > 100)) AS invalid_modis_confidence,
               count(*) FILTER (WHERE sensor = 'VIIRS' AND
                   (lower(trim(confidence_raw)) NOT IN ('low', 'nominal', 'high') OR confidence_raw IS NULL)) AS unexpected_viirs_confidence
        FROM fires
    """)


def build_profile_report(connection: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    """Build all requested EDA sections from DuckDB queries over the source Parquet."""
    return {
        "dataset_overview": profile_overview(connection),
        "temporal_coverage": profile_temporal(connection),
        "sensor_distribution": profile_sensor_distribution(connection),
        "day_night_distribution": profile_day_night(connection),
        "spatial_extent": profile_spatial(connection),
        "frp_statistics": profile_frp(connection),
        "brightness_statistics": profile_brightness(connection),
        "scan_track_statistics": profile_scan_track(connection),
        "confidence_statistics": profile_confidence(connection),
        "missing_values": profile_nulls(connection),
        "duplicate_analysis": profile_duplicates(connection),
        "source_file_distribution": profile_source_files(connection),
        "version_distribution": profile_versions(connection),
        "sensor_temporal_coverage": profile_temporal(connection)["sensor_date_ranges"],
        "data_quality_checks": profile_data_quality(connection),
    }


def save_json_report(report: dict[str, Any], output_path: str | Path = DEFAULT_REPORT_PATH) -> Path:
    """Write the profiling report as indented, standards-compliant JSON."""
    path = Path(output_path)
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(_native(report), file, indent=2, ensure_ascii=False, allow_nan=False)
        file.write("\n")
    return path


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parquet_path = get_parquet_path()
    logger.info("Profiling %s", parquet_path)
    connection = create_connection(parquet_path)
    try:
        report = build_profile_report(connection)
    finally:
        connection.close()
    report_path = save_json_report(report)
    print_report(report)
    logger.info("JSON report saved to %s", report_path)


def print_report(report: dict[str, Any]) -> None:
    """Print a concise sectioned report; the full detail is available in JSON."""
    overview = report["dataset_overview"]
    print("=" * 50)
    print("TerraIgnis Fire Dataset Profile")
    print("=" * 50)
    print("\n1. Dataset Overview")
    print(json.dumps(_native(overview), indent=2))
    sections = [
        ("2. Temporal Coverage", "temporal_coverage"),
        ("3. Sensor Distribution", "sensor_distribution"),
        ("4. Day/Night Distribution", "day_night_distribution"),
        ("5. Spatial Extent", "spatial_extent"),
        ("6. FRP Statistics", "frp_statistics"),
        ("7. Brightness Statistics", "brightness_statistics"),
        ("8. Scan / Track Statistics", "scan_track_statistics"),
        ("9. Confidence Statistics", "confidence_statistics"),
        ("10. Missing Values", "missing_values"),
        ("11. Duplicate Analysis", "duplicate_analysis"),
        ("12. Source File Distribution", "source_file_distribution"),
        ("13. Version Distribution", "version_distribution"),
        ("14. Sensor Temporal Coverage", "sensor_temporal_coverage"),
        ("15. Data Quality Checks", "data_quality_checks"),
    ]
    for title, key in sections:
        print(f"\n{title}")
        print(json.dumps(_native(report[key]), indent=2))


if __name__ == "__main__":
    main()
