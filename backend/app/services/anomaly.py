"""Daily robust anomaly indicators for observed H3 fire activity rows.

Scores compare detected-fire cell/date observations with other detected-fire
observations on the same date. Missing H3/date rows are never expanded or treated
as zero activity.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

import polars as pl

MAD_NORMAL_CONSISTENCY = 1.4826
MAD_EPSILON = 1e-6
MIN_DAILY_BASELINE_ROWS = 10
MIN_GLOBAL_BASELINE_ROWS = 10
REQUIRED_COLUMNS = {
    "h3_cell", "acq_date", "burn_index", "sensor_presence", "sensor_count",
}


@dataclass
class BurnIndexInspection:
    """Descriptive statistics and temporal support for the Burn Index input."""

    schema: dict[str, str]
    rows: int
    unique_h3_cells: int
    unique_dates: int
    first_date: str | None
    last_date: str | None
    burn_index_distribution: dict[str, Any]
    daily_observation_counts: dict[str, Any]
    daily_statistics_distribution: dict[str, dict[str, Any]]
    dates_with_zero_or_near_zero_mad: int
    sensor_presence: dict[str, int]
    nonzero_null_counts: dict[str, int]
    cell_observation_counts: dict[str, Any]
    complete_cell_date_grid: bool
    zero_fire_rows: int


@dataclass
class AnomalyValidation:
    """Row/key conservation and score integrity checks."""

    input_rows: int
    output_rows: int
    row_conservation: bool
    duplicate_cell_date_rows: int
    null_required_rows: int
    invalid_percentile_rows: int
    infinite_score_rows: int
    division_by_zero_rows: int
    nondeterministic_daily_baseline_dates: int
    fabricated_h3_cells: int
    fabricated_cell_date_rows: int
    missing_cell_date_rows: int
    fabricated_zero_fire_rows: int
    baseline_methods: dict[str, int]

    @property
    def is_valid(self) -> bool:
        return all((
            self.row_conservation,
            self.duplicate_cell_date_rows == 0,
            self.null_required_rows == 0,
            self.invalid_percentile_rows == 0,
            self.infinite_score_rows == 0,
            self.division_by_zero_rows == 0,
            self.nondeterministic_daily_baseline_dates == 0,
            self.fabricated_h3_cells == 0,
            self.fabricated_cell_date_rows == 0,
            self.missing_cell_date_rows == 0,
            self.fabricated_zero_fire_rows == 0,
        ))


def _require_columns(frame: pl.DataFrame, required: set[str] = REQUIRED_COLUMNS) -> None:
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Burn Index data is missing columns: {', '.join(sorted(missing))}")


def _stats(frame: pl.DataFrame, column: str) -> dict[str, Any]:
    return frame.select(
        pl.col(column).count().alias("count"), pl.col(column).null_count().alias("nulls"),
        pl.col(column).min().alias("min"), pl.col(column).mean().alias("mean"),
        pl.col(column).median().alias("median"), pl.col(column).std().alias("std"),
        pl.col(column).quantile(0.95).alias("p95"), pl.col(column).max().alias("max"),
        pl.col(column).skew().alias("skew"),
    ).row(0, named=True)


def inspect_burn_index_data(frame: pl.DataFrame) -> BurnIndexInspection:
    """Inspect global and date-level Burn Index distributions and support."""
    _require_columns(frame)
    rows = frame.height
    daily = frame.group_by("acq_date").agg(
        pl.len().alias("observations"),
        pl.col("burn_index").mean().alias("daily_mean"),
        pl.col("burn_index").median().alias("daily_median"),
        pl.col("burn_index").std().alias("daily_std"),
        (pl.col("burn_index") - pl.col("burn_index").median()).abs().median().alias("daily_mad"),
        pl.col("burn_index").quantile(0.25).alias("daily_p25"),
        pl.col("burn_index").quantile(0.75).alias("daily_p75"),
        pl.col("burn_index").quantile(0.95).alias("daily_p95"),
    ).sort("acq_date")
    daily_counts = daily.select(
        pl.col("observations").min().alias("min"),
        pl.col("observations").median().alias("median"),
        pl.col("observations").mean().alias("mean"),
        pl.col("observations").max().alias("max"),
    ).row(0, named=True) if daily.height else {}
    daily_distributions = {}
    for column in ("daily_mean", "daily_median", "daily_std", "daily_mad", "daily_p25", "daily_p75", "daily_p95"):
        daily_distributions[column] = _stats(daily, column) if daily.height else {}
    zero_mad_dates = daily.filter(pl.col("daily_mad").is_null() | (pl.col("daily_mad") <= MAD_EPSILON)).height if daily.height else 0
    null_counts = frame.null_count().row(0, named=True) if rows else {}
    presence_rows = frame.group_by("sensor_presence").len().to_dicts() if rows else []
    presence = {row["sensor_presence"]: row["len"] for row in presence_rows}
    cell_dates = frame.group_by("h3_cell").len().get_column("len") if rows else pl.Series([], dtype=pl.UInt32)
    cell_counts = {
        "min_dates": cell_dates.min() if len(cell_dates) else None,
        "median_dates": cell_dates.median() if len(cell_dates) else None,
        "p95_dates": cell_dates.quantile(0.95) if len(cell_dates) else None,
        "max_dates": cell_dates.max() if len(cell_dates) else None,
        "cells_seen_once": int((cell_dates == 1).sum()) if len(cell_dates) else 0,
    }
    unique_cells = frame["h3_cell"].n_unique() if rows else 0
    unique_dates = frame["acq_date"].n_unique() if rows else 0
    first_date = frame["acq_date"].min() if rows else None
    last_date = frame["acq_date"].max() if rows else None
    nonzero_nulls = {key: value for key, value in null_counts.items() if value}
    return BurnIndexInspection(
        schema={name: str(dtype) for name, dtype in frame.schema.items()},
        rows=rows,
        unique_h3_cells=unique_cells,
        unique_dates=unique_dates,
        first_date=first_date.isoformat() if first_date else None,
        last_date=last_date.isoformat() if last_date else None,
        burn_index_distribution=_stats(frame, "burn_index") if rows else {},
        daily_observation_counts=daily_counts,
        daily_statistics_distribution=daily_distributions,
        dates_with_zero_or_near_zero_mad=zero_mad_dates,
        sensor_presence=presence,
        nonzero_null_counts=nonzero_nulls,
        cell_observation_counts=cell_counts,
        complete_cell_date_grid=rows == unique_cells * unique_dates,
        zero_fire_rows=frame.filter(pl.col("total_fire_count") == 0).height if "total_fire_count" in frame.columns else 0,
    )


def calculate_daily_baseline(
    frame: pl.DataFrame,
    min_daily_rows: int = MIN_DAILY_BASELINE_ROWS,
    min_global_rows: int = MIN_GLOBAL_BASELINE_ROWS,
    mad_epsilon: float = MAD_EPSILON,
) -> pl.DataFrame:
    """Attach daily/global reference statistics and select a documented baseline.

    Priority: sufficiently sampled daily median/MAD; daily mean/std if MAD is
    unusable; global median/MAD for sparse or degenerate dates; then unavailable.
    """
    _require_columns(frame)
    if min_daily_rows < 1 or min_global_rows < 1 or mad_epsilon <= 0:
        raise ValueError("Baseline row minimums must be positive and MAD epsilon must be > 0")
    daily = frame.group_by("acq_date").agg(
        pl.len().alias("daily_observations"),
        pl.col("burn_index").mean().alias("daily_mean"),
        pl.col("burn_index").median().alias("daily_median"),
        pl.col("burn_index").std().alias("daily_std"),
        (pl.col("burn_index") - pl.col("burn_index").median()).abs().median().alias("daily_mad"),
        pl.col("burn_index").quantile(0.25).alias("daily_p25"),
        pl.col("burn_index").quantile(0.75).alias("daily_p75"),
        pl.col("burn_index").quantile(0.95).alias("daily_p95"),
    )
    global_stats = frame.select(
        pl.len().alias("global_observations"),
        pl.col("burn_index").mean().alias("global_mean"),
        pl.col("burn_index").median().alias("global_median"),
        pl.col("burn_index").std().alias("global_std"),
        (pl.col("burn_index") - pl.col("burn_index").median()).abs().median().alias("global_mad"),
    )
    global_values = global_stats.row(0, named=True)
    global_columns = [pl.lit(value).alias(name) for name, value in global_values.items()]
    joined = frame.join(daily, on="acq_date", how="left").with_columns(global_columns)
    daily_mad_scale = pl.col("daily_mad") * MAD_NORMAL_CONSISTENCY
    global_mad_scale = pl.col("global_mad") * MAD_NORMAL_CONSISTENCY
    method = (
        pl.when((pl.col("daily_observations") >= min_daily_rows) & (daily_mad_scale > mad_epsilon))
        .then(pl.lit("daily_mad"))
        .when((pl.col("daily_observations") >= min_daily_rows) & (pl.col("daily_std") > mad_epsilon))
        .then(pl.lit("daily_std_fallback"))
        .when((pl.col("global_observations") >= min_global_rows) & (global_mad_scale > mad_epsilon))
        .then(pl.lit("global_mad_fallback"))
        .when((pl.col("global_observations") >= min_global_rows) & (pl.col("global_std") > mad_epsilon))
        .then(pl.lit("global_std_fallback"))
        .otherwise(pl.lit("unavailable"))
    )
    center = (
        pl.when(method == "daily_mad").then(pl.col("daily_median"))
        .when(method == "daily_std_fallback").then(pl.col("daily_mean"))
        .when(method == "global_mad_fallback").then(pl.col("global_median"))
        .when(method == "global_std_fallback").then(pl.col("global_mean"))
        .otherwise(None)
    )
    scale = (
        pl.when(method == "daily_mad").then(daily_mad_scale)
        .when(method == "daily_std_fallback").then(pl.col("daily_std"))
        .when(method == "global_mad_fallback").then(global_mad_scale)
        .when(method == "global_std_fallback").then(pl.col("global_std"))
        .otherwise(None)
    )
    return joined.with_columns(
        method.alias("baseline_method"), center.alias("reference_center"), scale.alias("reference_scale")
    )


def calculate_robust_z_score(frame: pl.DataFrame) -> pl.DataFrame:
    """Calculate the primary score and optional global robust context score."""
    if "baseline_method" not in frame.columns:
        frame = calculate_daily_baseline(frame)
    daily_scale = pl.col("daily_mad") * MAD_NORMAL_CONSISTENCY
    global_scale = pl.col("global_mad") * MAD_NORMAL_CONSISTENCY
    daily_component = (
        pl.when(pl.col("daily_mad") * MAD_NORMAL_CONSISTENCY > MAD_EPSILON)
        .then((pl.col("burn_index") - pl.col("daily_median")) / daily_scale)
    )
    std_component = pl.when(pl.col("daily_std") > MAD_EPSILON).then(
        (pl.col("burn_index") - pl.col("daily_mean")) / pl.col("daily_std")
    )
    global_robust_component = pl.when(global_scale > MAD_EPSILON).then(
        (pl.col("burn_index") - pl.col("global_median")) / global_scale
    )
    global_std_component = pl.when(pl.col("global_std") > MAD_EPSILON).then(
        (pl.col("burn_index") - pl.col("global_mean")) / pl.col("global_std")
    )
    return frame.with_columns(
        pl.when(pl.col("baseline_method") == "daily_mad").then(daily_component)
        .when(pl.col("baseline_method") == "daily_std_fallback").then(std_component)
        .when(pl.col("baseline_method") == "global_mad_fallback").then(global_robust_component)
        .when(pl.col("baseline_method") == "global_std_fallback").then(global_std_component)
        .otherwise(None).alias("robust_z_score"),
        pl.when(global_scale > MAD_EPSILON).then(
            (pl.col("burn_index") - pl.col("global_median")) / global_scale
        ).otherwise(None).alias("global_robust_z"),
    )


def calculate_percentile(frame: pl.DataFrame) -> pl.DataFrame:
    """Add a within-date midrank percentile; ties share their average rank."""
    _require_columns(frame)
    rank = pl.col("burn_index").rank(method="average").over("acq_date")
    observations = pl.len().over("acq_date")
    percentile = pl.when(observations <= 1).then(0.5).otherwise((rank - 1) / (observations - 1))
    return frame.with_columns(percentile.alias("anomaly_percentile"))


def classify_anomaly(frame: pl.DataFrame) -> pl.DataFrame:
    """Apply transparent ±2/±3 score thresholds; unavailable scores stay explicit."""
    if "robust_z_score" not in frame.columns:
        raise ValueError("robust_z_score must be calculated before anomaly classification")
    z = pl.col("robust_z_score")
    level = (
        pl.when(z.is_null() | ~z.is_finite()).then(pl.lit("unavailable"))
        .when(z < -3).then(pl.lit("extreme_low"))
        .when(z < -2).then(pl.lit("low"))
        .when(z <= 2).then(pl.lit("normal"))
        .when(z <= 3).then(pl.lit("high"))
        .otherwise(pl.lit("extreme_high"))
    )
    return frame.with_columns(level.alias("anomaly_level"))


def build_anomaly_dataset(frame: pl.DataFrame) -> pl.DataFrame:
    """Build scores for existing detected-fire rows without expanding the H3 grid."""
    inspection = inspect_burn_index_data(frame)
    if inspection.rows == 0:
        raise ValueError("Cannot build anomalies from an empty Burn Index dataset")
    if inspection.nonzero_null_counts.get("h3_cell", 0) or inspection.nonzero_null_counts.get("acq_date", 0):
        raise ValueError("Burn Index input contains null H3 cells or dates")
    if inspection.nonzero_null_counts.get("burn_index", 0):
        raise ValueError("Burn Index input contains null scores")
    if frame.select(pl.struct(["h3_cell", "acq_date"]).n_unique()).item() != frame.height:
        raise ValueError("Burn Index input contains duplicate h3_cell + acq_date rows")
    if frame.filter(~pl.col("burn_index").is_finite()).height:
        raise ValueError("Burn Index values must be finite")
    if frame.filter((pl.col("burn_index") < 0) | (pl.col("burn_index") > 100)).height:
        raise ValueError("Burn Index values must be within [0, 100]")
    result = calculate_robust_z_score(calculate_daily_baseline(frame))
    result = calculate_percentile(result)
    return classify_anomaly(result)


def validate_anomalies(source: pl.DataFrame, output: pl.DataFrame) -> AnomalyValidation:
    """Validate conservation, keys, percentiles, finite scores, and baseline stability."""
    _require_columns(source)
    required = {
        "robust_z_score", "anomaly_percentile", "anomaly_level", "daily_median",
        "daily_mad", "daily_mean", "daily_std", "baseline_method", "reference_scale",
    }
    _require_columns(output, required)
    duplicate_rows = output.height - output.select(pl.struct(["h3_cell", "acq_date"]).n_unique()).item() if output.height else 0
    null_required = output.filter(
        pl.col("h3_cell").is_null() | pl.col("acq_date").is_null() | pl.col("burn_index").is_null()
    ).height
    invalid_percentiles = output.filter(
        pl.col("anomaly_percentile").is_null()
        | ~pl.col("anomaly_percentile").is_finite()
        | (pl.col("anomaly_percentile") < 0)
        | (pl.col("anomaly_percentile") > 1)
    ).height
    infinite_scores = output.filter(
        pl.col("robust_z_score").is_not_null() & ~pl.col("robust_z_score").is_finite()
    ).height
    division_by_zero = output.filter(
        pl.col("robust_z_score").is_not_null()
        & (pl.col("reference_scale").is_null() | (pl.col("reference_scale") <= 0))
    ).height
    baseline_fields = ["daily_median", "daily_mad", "daily_mean", "daily_std", "baseline_method"]
    inconsistent_dates = output.group_by("acq_date").agg([
        pl.col(field).n_unique().alias(field) for field in baseline_fields
    ]).filter(pl.any_horizontal([pl.col(field) > 1 for field in baseline_fields])).height
    source_cells = set(source["h3_cell"].drop_nulls().unique().to_list())
    output_cells = set(output["h3_cell"].drop_nulls().unique().to_list())
    fabricated_cells = len(output_cells.difference(source_cells))
    source_keys = set(source.select("h3_cell", "acq_date").iter_rows())
    output_keys = set(output.select("h3_cell", "acq_date").iter_rows())
    fabricated_keys = len(output_keys.difference(source_keys))
    missing_keys = len(source_keys.difference(output_keys))
    source_zero_rows = source.filter(pl.col("total_fire_count") == 0).height if "total_fire_count" in source.columns else 0
    output_zero_rows = output.filter(pl.col("total_fire_count") == 0).height if "total_fire_count" in output.columns else 0
    fabricated_zero = max(0, output_zero_rows - source_zero_rows)
    levels = output.group_by("baseline_method").len().sort("baseline_method").to_dicts()
    return AnomalyValidation(
        input_rows=source.height,
        output_rows=output.height,
        row_conservation=source.height == output.height,
        duplicate_cell_date_rows=duplicate_rows,
        null_required_rows=null_required,
        invalid_percentile_rows=invalid_percentiles,
        infinite_score_rows=infinite_scores,
        division_by_zero_rows=division_by_zero,
        nondeterministic_daily_baseline_dates=inconsistent_dates,
        fabricated_h3_cells=fabricated_cells,
        fabricated_cell_date_rows=fabricated_keys,
        missing_cell_date_rows=missing_keys,
        fabricated_zero_fire_rows=fabricated_zero,
        baseline_methods={row["baseline_method"]: row["len"] for row in levels},
    )


def ensure_valid_anomalies(validation: AnomalyValidation) -> None:
    """Raise a detailed error when anomaly output integrity checks fail."""
    if not validation.is_valid:
        raise ValueError(f"Anomaly validation failed: {asdict(validation)}")
