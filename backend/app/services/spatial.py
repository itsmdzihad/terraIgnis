"""H3 assignment and daily, sensor-aware fire observation aggregation."""

from __future__ import annotations

from dataclasses import dataclass

import h3
import polars as pl

H3_RESOLUTION = 7


@dataclass
class AggregationValidation:
    """Validation summary for an H3 daily aggregation."""

    input_records: int
    represented_records: int
    output_rows: int
    unique_h3_cells: int
    null_h3_cells: int
    null_acq_dates: int
    count_mismatches: int
    frp_mismatches: int

    @property
    def is_valid(self) -> bool:
        return not any((
            self.input_records != self.represented_records,
            self.null_h3_cells,
            self.null_acq_dates,
            self.count_mismatches,
            self.frp_mismatches,
        ))


def coordinates_to_h3(latitude: float, longitude: float, resolution: int = H3_RESOLUTION) -> str:
    """Convert a latitude/longitude pair into an H3 cell at ``resolution``."""
    if not 0 <= resolution <= 15:
        raise ValueError("H3 resolution must be between 0 and 15")
    return h3.latlng_to_cell(float(latitude), float(longitude), resolution)


def assign_h3_cells(
    observations: pl.DataFrame,
    resolution: int = H3_RESOLUTION,
) -> pl.DataFrame:
    """Return observations with a derived ``h3_cell`` column; inputs remain unchanged."""
    if not 0 <= resolution <= 15:
        raise ValueError("H3 resolution must be between 0 and 15")
    required = {"latitude", "longitude"}
    missing = required.difference(observations.columns)
    if missing:
        raise ValueError(f"Missing coordinate columns: {', '.join(sorted(missing))}")

    cell_expr = pl.struct("latitude", "longitude").map_elements(
        lambda row: (
            None if row["latitude"] is None or row["longitude"] is None
            else coordinates_to_h3(row["latitude"], row["longitude"], resolution)
        ),
        return_dtype=pl.String,
        skip_nulls=False,
    )
    return observations.with_columns(cell_expr.alias("h3_cell"))


def _conditional_sensor_sum(sensor_name: str, column: str, sensor_count: pl.Expr) -> pl.Expr:
    """Sum a sensor's values, returning null if that sensor has no records in the group."""
    return pl.when(sensor_count > 0).then(
        pl.col(column).filter(pl.col("sensor") == sensor_name).sum()
    ).otherwise(None)


def aggregate_daily_h3(
    observations: pl.DataFrame,
    resolution: int = H3_RESOLUTION,
) -> pl.DataFrame:
    """Assign H3 cells and aggregate observations by cell and acquisition date."""
    required = {
        "latitude", "longitude", "acq_date", "sensor", "frp", "brightness",
        "brightness_longwave", "scan", "track", "daynight", "confidence_raw",
        "confidence_numeric",
    }
    missing = required.difference(observations.columns)
    if missing:
        raise ValueError(f"Missing required fire columns: {', '.join(sorted(missing))}")

    tagged = assign_h3_cells(observations, resolution)
    modis_count = (pl.col("sensor") == "MODIS").sum()
    viirs_count = (pl.col("sensor") == "VIIRS").sum()
    aggregated = tagged.group_by(["h3_cell", "acq_date"]).agg(
        pl.len().cast(pl.Int64).alias("total_fire_count"),
        modis_count.cast(pl.Int64).alias("modis_fire_count"),
        viirs_count.cast(pl.Int64).alias("viirs_fire_count"),
        pl.col("frp").sum().alias("total_frp"),
        _conditional_sensor_sum("MODIS", "frp", modis_count).alias("modis_frp_sum"),
        _conditional_sensor_sum("VIIRS", "frp", viirs_count).alias("viirs_frp_sum"),
        pl.col("frp").filter(pl.col("sensor") == "MODIS").mean().alias("modis_frp_mean"),
        pl.col("frp").filter(pl.col("sensor") == "VIIRS").mean().alias("viirs_frp_mean"),
        pl.col("brightness").filter(pl.col("sensor") == "MODIS").mean().alias("modis_brightness_mean"),
        pl.col("brightness").filter(pl.col("sensor") == "VIIRS").mean().alias("viirs_brightness_mean"),
        pl.col("brightness_longwave").filter(pl.col("sensor") == "MODIS").mean().alias("modis_brightness_longwave_mean"),
        pl.col("brightness_longwave").filter(pl.col("sensor") == "VIIRS").mean().alias("viirs_brightness_longwave_mean"),
        pl.col("scan").filter(pl.col("sensor") == "MODIS").mean().alias("modis_mean_scan"),
        pl.col("scan").filter(pl.col("sensor") == "VIIRS").mean().alias("viirs_mean_scan"),
        pl.col("track").filter(pl.col("sensor") == "MODIS").mean().alias("modis_mean_track"),
        pl.col("track").filter(pl.col("sensor") == "VIIRS").mean().alias("viirs_mean_track"),
        (pl.col("daynight") == "D").sum().cast(pl.Int64).alias("day_fire_count"),
        (pl.col("daynight") == "N").sum().cast(pl.Int64).alias("night_fire_count"),
        pl.col("confidence_numeric").filter(pl.col("sensor") == "MODIS").mean().alias("modis_confidence_mean"),
        ((pl.col("sensor") == "VIIRS") & (pl.col("confidence_raw").str.to_lowercase() == "low")).sum().cast(pl.Int64).alias("viirs_low_confidence_count"),
        ((pl.col("sensor") == "VIIRS") & (pl.col("confidence_raw").str.to_lowercase() == "nominal")).sum().cast(pl.Int64).alias("viirs_nominal_confidence_count"),
        ((pl.col("sensor") == "VIIRS") & (pl.col("confidence_raw").str.to_lowercase() == "high")).sum().cast(pl.Int64).alias("viirs_high_confidence_count"),
    )
    return aggregated.sort(["acq_date", "h3_cell"])


def validate_aggregation(
    aggregated: pl.DataFrame,
    input_records: int,
) -> AggregationValidation:
    """Check cell/date keys and record/FRP conservation without modifying the result."""
    invalid_counts = aggregated.filter(
        pl.col("total_fire_count") != pl.col("modis_fire_count") + pl.col("viirs_fire_count")
    ).height
    frp_sum = (
        pl.col("modis_frp_sum").fill_null(0.0) + pl.col("viirs_frp_sum").fill_null(0.0)
    )
    frp_mismatches = aggregated.filter(
        ~((pl.col("total_frp") - frp_sum).abs() <= (1e-8 + pl.col("total_frp").abs() * 1e-10))
    ).height
    summary = aggregated.select(
        pl.col("total_fire_count").sum().alias("represented_records"),
        pl.col("h3_cell").null_count().alias("null_h3_cells"),
        pl.col("acq_date").null_count().alias("null_acq_dates"),
        pl.col("h3_cell").n_unique().alias("unique_h3_cells"),
    ).row(0, named=True) if aggregated.height else {
        "represented_records": 0, "null_h3_cells": 0, "null_acq_dates": 0, "unique_h3_cells": 0,
    }
    return AggregationValidation(
        input_records=input_records,
        represented_records=summary["represented_records"] or 0,
        output_rows=aggregated.height,
        unique_h3_cells=summary["unique_h3_cells"] or 0,
        null_h3_cells=summary["null_h3_cells"] or 0,
        null_acq_dates=summary["null_acq_dates"] or 0,
        count_mismatches=invalid_counts,
        frp_mismatches=frp_mismatches,
    )


def validate_h3_cell_resolution(frame: pl.DataFrame, resolution: int = H3_RESOLUTION) -> bool:
    """Return whether every non-null H3 cell has the requested resolution."""
    return all(h3.get_resolution(cell) == resolution for cell in frame["h3_cell"].drop_nulls().to_list())


def ensure_valid_aggregation(validation: AggregationValidation) -> None:
    """Raise a useful error if aggregation invariants fail."""
    if not validation.is_valid:
        raise ValueError(f"H3 aggregation validation failed: {validation}")
