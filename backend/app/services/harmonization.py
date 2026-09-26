"""Auditable, sensor-aware normalization of daily H3 fire aggregates.

The generated activity and FRP values are unitless within-dataset indices. They
are not estimates of a sensor-independent fire count or physical FRP in MW.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

import h3
import polars as pl

COUNT_COLUMNS = ("total_fire_count", "modis_fire_count", "viirs_fire_count")
FRP_COLUMNS = ("total_frp", "modis_frp_sum", "viirs_frp_sum")
MODIS_METRICS = (
    "modis_frp_sum", "modis_frp_mean", "modis_brightness_mean",
    "modis_brightness_longwave_mean", "modis_mean_scan", "modis_mean_track",
    "modis_confidence_mean",
)
VIIRS_METRICS = (
    "viirs_frp_sum", "viirs_frp_mean", "viirs_brightness_mean",
    "viirs_brightness_longwave_mean", "viirs_mean_scan", "viirs_mean_track",
)


@dataclass
class H3Inspection:
    """Schema, descriptive statistics, and integrity checks for H3 daily data."""

    schema: dict[str, str]
    rows: int
    unique_h3_cells: int
    first_date: str | None
    last_date: str | None
    unique_dates: int
    sensor_presence: dict[str, int]
    sensor_presence_percentages: dict[str, float]
    distributions: dict[str, dict[str, Any]]
    sensor_contribution_by_date: list[dict[str, Any]]
    both_sensor_comparison: dict[str, Any]
    nonzero_null_counts: dict[str, int]
    quality_checks: dict[str, int]
    conservation: dict[str, Any]
    h3_resolutions: list[int]


@dataclass
class HarmonizationValidation:
    """Conservation, key, provenance, and normalized-index validation results."""

    input_rows: int
    output_rows: int
    row_conserved: bool
    duplicate_cell_date_rows: int
    null_cell_or_date_rows: int
    modis_count_input: int
    modis_count_output: int
    viirs_count_input: int
    viirs_count_output: int
    modis_frp_input: float
    modis_frp_output: float
    viirs_frp_input: float
    viirs_frp_output: float
    frp_conserved: bool
    negative_harmonized_values: int
    invalid_index_values: int
    preserved_input_columns: bool

    @property
    def is_valid(self) -> bool:
        return all((
            self.row_conserved,
            self.duplicate_cell_date_rows == 0,
            self.null_cell_or_date_rows == 0,
            self.modis_count_input == self.modis_count_output,
            self.viirs_count_input == self.viirs_count_output,
            self.frp_conserved,
            self.negative_harmonized_values == 0,
            self.invalid_index_values == 0,
            self.preserved_input_columns,
        ))


def _require_columns(frame: pl.DataFrame, required: set[str]) -> None:
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"H3 data is missing required columns: {', '.join(sorted(missing))}")


def inspect_h3_data(frame: pl.DataFrame) -> H3Inspection:
    """Profile sensor coverage, aggregate distributions, and H3 integrity."""
    _require_columns(frame, {
        "h3_cell", "acq_date", "total_fire_count", "modis_fire_count",
        "viirs_fire_count", "total_frp", "modis_frp_sum", "viirs_frp_sum",
        "modis_mean_scan", "modis_mean_track", "viirs_mean_scan", "viirs_mean_track",
    })
    rows = frame.height
    both_mask = (pl.col("modis_fire_count") > 0) & (pl.col("viirs_fire_count") > 0)
    modis_mask = (pl.col("modis_fire_count") > 0) & (pl.col("viirs_fire_count") == 0)
    viirs_mask = (pl.col("viirs_fire_count") > 0) & (pl.col("modis_fire_count") == 0)
    presence_counts = frame.select(
        modis_mask.sum().alias("modis_only"),
        viirs_mask.sum().alias("viirs_only"),
        both_mask.sum().alias("both"),
        ((pl.col("modis_fire_count") == 0) & (pl.col("viirs_fire_count") == 0)).sum().alias("neither"),
    ).row(0, named=True) if rows else {"modis_only": 0, "viirs_only": 0, "both": 0, "neither": 0}
    presence_percentages = {
        key: (value * 100.0 / rows if rows else 0.0) for key, value in presence_counts.items()
    }

    distributions: dict[str, dict[str, Any]] = {}
    for column in (*COUNT_COLUMNS, *FRP_COLUMNS):
        stats = frame.select(
            pl.col(column).count().alias("count"), pl.col(column).min().alias("min"),
            pl.col(column).max().alias("max"), pl.col(column).mean().alias("mean"),
            pl.col(column).median().alias("median"), pl.col(column).quantile(0.95).alias("p95"),
            pl.col(column).sum().alias("sum"),
        ).row(0, named=True)
        distributions[column] = stats

    dates = frame.group_by("acq_date").agg(
        pl.col("modis_fire_count").sum().alias("modis_records"),
        pl.col("viirs_fire_count").sum().alias("viirs_records"),
        pl.len().alias("cell_date_rows"),
    ).sort("acq_date").to_dicts()
    both_comparison = frame.filter(both_mask).select(
        pl.len().alias("cell_dates"),
        pl.col("modis_fire_count").mean().alias("mean_modis_count"),
        pl.col("viirs_fire_count").mean().alias("mean_viirs_count"),
        pl.col("modis_frp_sum").mean().alias("mean_modis_frp_sum"),
        pl.col("viirs_frp_sum").mean().alias("mean_viirs_frp_sum"),
    ).row(0, named=True) if rows else {}

    nulls = frame.null_count().row(0, named=True)
    nonzero_nulls = {key: value for key, value in nulls.items() if value}
    count_mismatch = frame.filter(
        pl.col("total_fire_count") != pl.col("modis_fire_count") + pl.col("viirs_fire_count")
    ).height
    frp_error = (
        pl.col("total_frp")
        - pl.col("modis_frp_sum").fill_null(0.0)
        - pl.col("viirs_frp_sum").fill_null(0.0)
    ).abs()
    frp_mismatch = frame.filter(frp_error > (1e-8 + pl.col("total_frp").abs() * 1e-10)).height
    duplicate_rows = rows - frame.select(pl.struct(["h3_cell", "acq_date"]).n_unique()).item() if rows else 0
    sensor_inconsistent = frame.filter(
        ((pl.col("modis_fire_count") == 0) & pl.any_horizontal([pl.col(c).is_not_null() for c in MODIS_METRICS]))
        | ((pl.col("viirs_fire_count") == 0) & pl.any_horizontal([pl.col(c).is_not_null() for c in VIIRS_METRICS]))
    ).height
    negative_values = frame.select([
        (pl.col(column) < 0).sum().alias(column)
        for column in (*COUNT_COLUMNS, *FRP_COLUMNS)
    ]).row(0, named=True) if rows else {}
    outside_h3_res = []
    for cell in frame["h3_cell"].drop_nulls().unique().to_list():
        try:
            outside_h3_res.append(h3.get_resolution(cell))
        except (TypeError, ValueError):
            outside_h3_res.append(-1)

    conservation_values = frame.select(
        pl.col("total_fire_count").sum().alias("total_fire_count"),
        pl.col("modis_fire_count").sum().alias("modis_fire_count"),
        pl.col("viirs_fire_count").sum().alias("viirs_fire_count"),
        pl.col("total_frp").sum().alias("total_frp"),
        pl.col("modis_frp_sum").sum().alias("modis_frp_sum"),
        pl.col("viirs_frp_sum").sum().alias("viirs_frp_sum"),
    ).row(0, named=True) if rows else {}
    quality = {
        "null_h3_cell_or_date_rows": frame.filter(pl.col("h3_cell").is_null() | pl.col("acq_date").is_null()).height,
        "duplicate_h3_cell_date_rows": duplicate_rows,
        "negative_value_counts": sum(int(value or 0) for value in negative_values.values()),
        "count_mismatch_rows": count_mismatch,
        "frp_mismatch_rows": frp_mismatch,
        "unexpected_sensor_metric_rows": sensor_inconsistent,
        "invalid_date_rows": frame.filter(pl.col("acq_date").is_null()).height,
    }
    first_date = frame["acq_date"].min() if rows else None
    last_date = frame["acq_date"].max() if rows else None
    return H3Inspection(
        schema={name: str(dtype) for name, dtype in frame.schema.items()},
        rows=rows,
        unique_h3_cells=frame["h3_cell"].n_unique() if rows else 0,
        first_date=first_date.isoformat() if first_date else None,
        last_date=last_date.isoformat() if last_date else None,
        unique_dates=frame["acq_date"].n_unique() if rows else 0,
        sensor_presence=presence_counts,
        sensor_presence_percentages=presence_percentages,
        distributions=distributions,
        sensor_contribution_by_date=dates,
        both_sensor_comparison=both_comparison,
        nonzero_null_counts=nonzero_nulls,
        quality_checks=quality,
        conservation=conservation_values,
        h3_resolutions=sorted(set(outside_h3_res)),
    )


def calculate_sensor_metrics(frame: pl.DataFrame) -> pl.DataFrame:
    """Add sensor-specific footprint-adjusted fire and FRP densities.

    Mean scan × mean track is an approximate nominal footprint area in km². The
    resulting densities are only normalization inputs, not physical fire counts.
    """
    _require_columns(frame, {
        "modis_fire_count", "viirs_fire_count", "modis_frp_sum", "viirs_frp_sum",
        "modis_mean_scan", "modis_mean_track", "viirs_mean_scan", "viirs_mean_track",
    })
    modis_area = pl.col("modis_mean_scan") * pl.col("modis_mean_track")
    viirs_area = pl.col("viirs_mean_scan") * pl.col("viirs_mean_track")
    return frame.with_columns(
        modis_area.alias("modis_effective_footprint_km2"),
        viirs_area.alias("viirs_effective_footprint_km2"),
    ).with_columns(
        pl.when((pl.col("modis_fire_count") > 0) & (pl.col("modis_effective_footprint_km2") > 0))
        .then(pl.col("modis_fire_count") / pl.col("modis_effective_footprint_km2"))
        .otherwise(None).alias("modis_fire_density"),
        pl.when((pl.col("viirs_fire_count") > 0) & (pl.col("viirs_effective_footprint_km2") > 0))
        .then(pl.col("viirs_fire_count") / pl.col("viirs_effective_footprint_km2"))
        .otherwise(None).alias("viirs_fire_density"),
        pl.when((pl.col("modis_fire_count") > 0) & (pl.col("modis_effective_footprint_km2") > 0))
        .then(pl.col("modis_frp_sum") / pl.col("modis_effective_footprint_km2"))
        .otherwise(None).alias("modis_frp_density"),
        pl.when((pl.col("viirs_fire_count") > 0) & (pl.col("viirs_effective_footprint_km2") > 0))
        .then(pl.col("viirs_frp_sum") / pl.col("viirs_effective_footprint_km2"))
        .otherwise(None).alias("viirs_frp_density"),
    )


def _percentile_rank(frame: pl.DataFrame, source: str, target: str) -> pl.DataFrame:
    """Rank non-null values as mid-rank empirical percentiles in (0, 1)."""
    count = pl.col(source).count()
    percentile = (pl.col(source).rank(method="average") - 0.5) / count
    return frame.with_columns(percentile.alias(target))


def normalize_fire_activity(frame: pl.DataFrame) -> pl.DataFrame:
    """Add per-sensor empirical activity percentiles from footprint-adjusted counts."""
    frame = _percentile_rank(frame, "modis_fire_density", "modis_fire_activity_index")
    return _percentile_rank(frame, "viirs_fire_density", "viirs_fire_activity_index")


def normalize_frp(frame: pl.DataFrame) -> pl.DataFrame:
    """Add per-sensor empirical FRP-density percentiles; no MW conversion is implied."""
    frame = _percentile_rank(frame, "modis_frp_density", "modis_frp_index")
    return _percentile_rank(frame, "viirs_frp_density", "viirs_frp_index")


def _mean_available(first: pl.Expr, second: pl.Expr) -> pl.Expr:
    present_count = first.is_not_null().cast(pl.UInt8) + second.is_not_null().cast(pl.UInt8)
    return pl.when(present_count > 0).then(
        (first.fill_null(0.0) + second.fill_null(0.0)) / present_count
    ).otherwise(None)


def calculate_harmonized_metrics(frame: pl.DataFrame) -> pl.DataFrame:
    """Add sensor provenance and equal-sensor-weighted unitless indices.

    Each available sensor percentile contributes one vote. Scores are averaged,
    not summed, so a dual-sensor cell/date is not counted twice.
    """
    modis = pl.col("modis_fire_count") > 0
    viirs = pl.col("viirs_fire_count") > 0
    return frame.with_columns(
        modis.alias("modis_has_detections"),
        viirs.alias("viirs_has_detections"),
        (modis.cast(pl.UInt8) + viirs.cast(pl.UInt8)).alias("sensor_count"),
        pl.when(modis & viirs).then(pl.lit("MODIS+VIIRS"))
        .when(modis).then(pl.lit("MODIS"))
        .when(viirs).then(pl.lit("VIIRS"))
        .otherwise(pl.lit("NONE")).alias("sensor_presence"),
        _mean_available(pl.col("modis_fire_activity_index"), pl.col("viirs_fire_activity_index"))
        .alias("harmonized_fire_activity"),
        _mean_available(pl.col("modis_frp_index"), pl.col("viirs_frp_index"))
        .alias("harmonized_frp_index"),
    )


def build_harmonized_dataset(frame: pl.DataFrame) -> pl.DataFrame:
    """Inspect the H3 schema, then add auditable normalized sensor metrics."""
    inspection = inspect_h3_data(frame)
    if inspection.quality_checks["null_h3_cell_or_date_rows"]:
        raise ValueError("Input H3 data contains null h3_cell or acq_date values")
    if inspection.quality_checks["duplicate_h3_cell_date_rows"]:
        raise ValueError("Input H3 data contains duplicate h3_cell + acq_date rows")
    if inspection.quality_checks["count_mismatch_rows"] or inspection.quality_checks["frp_mismatch_rows"]:
        raise ValueError("Input H3 data fails sensor count or FRP conservation checks")
    if inspection.quality_checks["negative_value_counts"]:
        raise ValueError("Input H3 data contains negative counts or FRP values")
    if inspection.quality_checks["unexpected_sensor_metric_rows"]:
        raise ValueError("Input H3 data contains sensor metrics without sensor detections")
    return calculate_harmonized_metrics(
        normalize_frp(
            normalize_fire_activity(calculate_sensor_metrics(frame))
        )
    )


def _close(first: float, second: float) -> bool:
    return math.isclose(first, second, rel_tol=1e-10, abs_tol=1e-8)


def validate_harmonized_dataset(
    source: pl.DataFrame,
    output: pl.DataFrame,
) -> HarmonizationValidation:
    """Check key uniqueness, source provenance, conservation, and index bounds."""
    _require_columns(source, {"h3_cell", "acq_date", *COUNT_COLUMNS, *FRP_COLUMNS})
    required_output = {
        "sensor_count", "sensor_presence", "harmonized_fire_activity", "harmonized_frp_index",
        "modis_has_detections", "viirs_has_detections",
    }
    _require_columns(output, required_output)
    input_counts = source.select(
        pl.col("modis_fire_count").sum(), pl.col("viirs_fire_count").sum()
    ).row(0)
    output_counts = output.select(
        pl.col("modis_fire_count").sum(), pl.col("viirs_fire_count").sum()
    ).row(0)
    input_frp = source.select(pl.col("modis_frp_sum").sum(), pl.col("viirs_frp_sum").sum()).row(0)
    output_frp = output.select(pl.col("modis_frp_sum").sum(), pl.col("viirs_frp_sum").sum()).row(0)
    frp_conserved = all(
        _close(float(before or 0), float(after or 0))
        for before, after in zip(input_frp, output_frp)
    )
    null_keys = output.filter(pl.col("h3_cell").is_null() | pl.col("acq_date").is_null()).height
    duplicate_rows = output.height - output.select(pl.struct(["h3_cell", "acq_date"]).n_unique()).item() if output.height else 0
    indices = ["modis_fire_activity_index", "viirs_fire_activity_index", "modis_frp_index", "viirs_frp_index", "harmonized_fire_activity", "harmonized_frp_index"]
    negative = output.select([
        (pl.col(column) < 0).sum().alias(column) for column in indices
    ]).row(0, named=True)
    invalid = output.select([
        ((pl.col(column) > 1) | ~pl.col(column).is_finite()).sum().alias(column)
        for column in indices
    ]).row(0, named=True)
    return HarmonizationValidation(
        input_rows=source.height,
        output_rows=output.height,
        row_conserved=source.height == output.height,
        duplicate_cell_date_rows=duplicate_rows,
        null_cell_or_date_rows=null_keys,
        modis_count_input=int(input_counts[0] or 0),
        modis_count_output=int(output_counts[0] or 0),
        viirs_count_input=int(input_counts[1] or 0),
        viirs_count_output=int(output_counts[1] or 0),
        modis_frp_input=float(input_frp[0] or 0),
        modis_frp_output=float(output_frp[0] or 0),
        viirs_frp_input=float(input_frp[1] or 0),
        viirs_frp_output=float(output_frp[1] or 0),
        frp_conserved=frp_conserved,
        negative_harmonized_values=sum(int(value or 0) for value in negative.values()),
        invalid_index_values=sum(int(value or 0) for value in invalid.values()),
        preserved_input_columns=set(source.columns).issubset(output.columns),
    )


def ensure_valid_harmonization(validation: HarmonizationValidation) -> None:
    """Raise when the output fails an auditable harmonization invariant."""
    if not validation.is_valid:
        raise ValueError(f"Harmonized dataset validation failed: {asdict(validation)}")
