"""Build a bounded, relative Burn Index from harmonized H3 fire indices.

The Burn Index is a visualization-oriented composite for the available study
period. It is not burned area, ground truth, or physical fire energy.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

import polars as pl

ACTIVITY_WEIGHT = 0.6
FRP_WEIGHT = 0.4
INDEX_SCALE = 100.0
REQUIRED_COLUMNS = {
    "h3_cell", "acq_date", "sensor_presence", "sensor_count",
    "harmonized_fire_activity", "harmonized_frp_index",
    "modis_fire_count", "viirs_fire_count",
}


@dataclass
class HarmonizedInspection:
    """Exploratory statistics and data-quality findings for the harmonized data."""

    schema: dict[str, str]
    numeric_columns: list[str]
    rows: int
    unique_h3_cells: int
    first_date: str | None
    last_date: str | None
    unique_dates: int
    sensor_presence: dict[str, int]
    missing_values: dict[str, int]
    index_distributions: dict[str, dict[str, Any]]
    pearson_correlation: float | None
    spearman_correlation: float | None
    activity_frp_candidate_comparison: list[dict[str, float]]
    daily_distribution: list[dict[str, Any]]
    cell_observation_distribution: dict[str, Any]
    zero_fire_rows: int
    possible_cell_date_pairs: int
    complete_cell_date_grid: bool


@dataclass
class BurnIndexValidation:
    """Conservation, uniqueness, component, and bounded-score checks."""

    input_rows: int
    output_rows: int
    row_conservation: bool
    duplicate_cell_date_rows: int
    null_required_values: int
    input_modis_count: int
    output_modis_count: int
    input_viirs_count: int
    output_viirs_count: int
    sensor_totals_conserved: bool
    burn_index_min: float | None
    burn_index_max: float | None
    negative_scores: int
    out_of_bounds_scores: int
    invalid_components: int
    invalid_effective_weights: int
    score_formula_mismatches: int
    modis_only_valid_rows: int
    viirs_only_valid_rows: int
    both_sensor_valid_rows: int
    modis_only_rows: int
    viirs_only_rows: int
    both_sensor_rows: int
    sensor_presence_mismatches: int
    provenance_columns_preserved: bool

    @property
    def is_valid(self) -> bool:
        return all((
            self.row_conservation,
            self.duplicate_cell_date_rows == 0,
            self.null_required_values == 0,
            self.sensor_totals_conserved,
            self.negative_scores == 0,
            self.out_of_bounds_scores == 0,
            self.invalid_components == 0,
            self.invalid_effective_weights == 0,
            self.score_formula_mismatches == 0,
            self.provenance_columns_preserved,
            self.modis_only_valid_rows == self.modis_only_rows,
            self.viirs_only_valid_rows == self.viirs_only_rows,
            self.both_sensor_valid_rows == self.both_sensor_rows,
            self.sensor_presence_mismatches == 0,
        ))


def _require_columns(frame: pl.DataFrame, required: set[str] = REQUIRED_COLUMNS) -> None:
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Harmonized dataset is missing columns: {', '.join(sorted(missing))}")


def _distribution(frame: pl.DataFrame, column: str) -> dict[str, Any]:
    return frame.select(
        pl.col(column).count().alias("count"),
        pl.col(column).null_count().alias("nulls"),
        pl.col(column).min().alias("min"),
        pl.col(column).mean().alias("mean"),
        pl.col(column).median().alias("median"),
        pl.col(column).quantile(0.75).alias("p75"),
        pl.col(column).quantile(0.95).alias("p95"),
        pl.col(column).quantile(0.99).alias("p99"),
        pl.col(column).max().alias("max"),
        pl.col(column).skew().alias("skew"),
    ).row(0, named=True)


def inspect_harmonized_data(frame: pl.DataFrame) -> HarmonizedInspection:
    """Profile schema, index distributions, sensor coverage, time, and cell support."""
    _require_columns(frame)
    rows = frame.height
    numeric_types = {
        pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32,
        pl.UInt64, pl.Float32, pl.Float64,
    }
    numeric_columns = [name for name, dtype in frame.schema.items() if dtype in numeric_types]
    indices = ["harmonized_fire_activity", "harmonized_frp_index"]
    distributions = {name: _distribution(frame, name) for name in indices}

    if rows:
        correlations = frame.select(
            pl.corr(indices[0], indices[1]).alias("pearson"),
            pl.corr(pl.col(indices[0]).rank(), pl.col(indices[1]).rank()).alias("spearman"),
        ).row(0, named=True)
        presence = frame.group_by("sensor_presence").len().sort("sensor_presence").to_dicts()
        sensor_presence = {row["sensor_presence"]: row["len"] for row in presence}
        missing_values = {
            key: value for key, value in frame.null_count().row(0, named=True).items() if value
        }
        daily = frame.group_by("acq_date").agg(
            pl.len().alias("cell_date_rows"),
            pl.col(indices[0]).mean().alias("mean_activity_index"),
            pl.col(indices[1]).mean().alias("mean_frp_index"),
        ).sort("acq_date").to_dicts()
        cell_counts = frame.group_by("h3_cell").len().get_column("len")
        cell_distribution = {
            "min_dates_with_detections": cell_counts.min(),
            "median_dates_with_detections": cell_counts.median(),
            "p95_dates_with_detections": cell_counts.quantile(0.95),
            "max_dates_with_detections": cell_counts.max(),
            "cells_with_one_date": int((cell_counts == 1).sum()),
            "cells_with_five_or_more_dates": int((cell_counts >= 5).sum()),
        }
        activity = pl.col(indices[0])
        frp = pl.col(indices[1])
        candidate_comparison = []
        for activity_weight, frp_weight in ((0.5, 0.5), (0.6, 0.4), (0.7, 0.3)):
            combined = activity * activity_weight + frp * frp_weight
            result = frame.select(
                (combined * 100).mean().alias("mean"),
                (combined * 100).median().alias("median"),
                (combined * 100).quantile(0.95).alias("p95"),
                (combined * 100).max().alias("max"),
                combined.skew().alias("skew"),
            ).row(0, named=True)
            candidate_comparison.append({"activity_weight": activity_weight, "frp_weight": frp_weight, **result})
        zero_fire_rows = frame.filter(pl.col("total_fire_count") == 0).height if "total_fire_count" in frame.columns else 0
        first_date = frame["acq_date"].min()
        last_date = frame["acq_date"].max()
        unique_cells = frame["h3_cell"].n_unique()
        unique_dates = frame["acq_date"].n_unique()
    else:
        correlations = {"pearson": None, "spearman": None}
        sensor_presence, missing_values, daily = {}, {}, []
        cell_distribution = {}
        candidate_comparison = []
        zero_fire_rows = unique_cells = unique_dates = 0
        first_date = last_date = None

    possible_pairs = unique_cells * unique_dates
    return HarmonizedInspection(
        schema={name: str(dtype) for name, dtype in frame.schema.items()},
        numeric_columns=numeric_columns,
        rows=rows,
        unique_h3_cells=unique_cells,
        first_date=first_date.isoformat() if first_date else None,
        last_date=last_date.isoformat() if last_date else None,
        unique_dates=unique_dates,
        sensor_presence=sensor_presence,
        missing_values=missing_values,
        index_distributions=distributions,
        pearson_correlation=correlations["pearson"],
        spearman_correlation=correlations["spearman"],
        activity_frp_candidate_comparison=candidate_comparison,
        daily_distribution=daily,
        cell_observation_distribution=cell_distribution,
        zero_fire_rows=zero_fire_rows,
        possible_cell_date_pairs=possible_pairs,
        complete_cell_date_grid=rows == possible_pairs,
    )


def normalize_activity(frame: pl.DataFrame) -> pl.DataFrame:
    """Expose the already percentile-normalized activity as an auditable component."""
    _require_columns(frame)
    return frame.with_columns(
        pl.col("harmonized_fire_activity").fill_nan(None).alias("activity_component")
    )


def normalize_frp(frame: pl.DataFrame) -> pl.DataFrame:
    """Expose the already percentile-normalized FRP signal as an auditable component."""
    _require_columns(frame)
    return frame.with_columns(
        pl.col("harmonized_frp_index").fill_nan(None).alias("frp_component")
    )


def calculate_burn_components(frame: pl.DataFrame) -> pl.DataFrame:
    """Attach source indices and row-specific weights, renormalizing if one is null."""
    frame = normalize_frp(normalize_activity(frame))
    activity_valid = pl.col("activity_component").is_not_null()
    frp_valid = pl.col("frp_component").is_not_null()
    available_weight = (
        activity_valid.cast(pl.Float64) * ACTIVITY_WEIGHT
        + frp_valid.cast(pl.Float64) * FRP_WEIGHT
    )
    return frame.with_columns(
        pl.when(available_weight > 0)
        .then(activity_valid.cast(pl.Float64) * ACTIVITY_WEIGHT / available_weight)
        .otherwise(None).alias("activity_weight"),
        pl.when(available_weight > 0)
        .then(frp_valid.cast(pl.Float64) * FRP_WEIGHT / available_weight)
        .otherwise(None).alias("frp_weight"),
    )


def calculate_burn_index(frame: pl.DataFrame) -> pl.DataFrame:
    """Calculate a 0–100 weighted composite, without penalizing sensor absence."""
    result = calculate_burn_components(frame)
    score = (
        pl.col("activity_component").fill_null(0.0) * pl.col("activity_weight").fill_null(0.0)
        + pl.col("frp_component").fill_null(0.0) * pl.col("frp_weight").fill_null(0.0)
    )
    return result.with_columns(
        pl.col("harmonized_fire_activity").alias("harmonized_activity_index"),
        pl.when(pl.col("activity_weight").is_not_null() | pl.col("frp_weight").is_not_null())
        .then(score * INDEX_SCALE).otherwise(None).alias("burn_index"),
    )


def build_burn_index(frame: pl.DataFrame) -> pl.DataFrame:
    """Inspect the input, calculate its score, and retain all source provenance."""
    inspection = inspect_harmonized_data(frame)
    if inspection.rows == 0:
        raise ValueError("Cannot build a Burn Index from an empty harmonized dataset")
    if inspection.schema.get("acq_date") != "Date":
        raise ValueError("acq_date must be a parsed Date column")
    if inspection.missing_values.get("h3_cell", 0) or inspection.missing_values.get("acq_date", 0):
        raise ValueError("Harmonized data contains null H3 cells or acquisition dates")
    for column in ("harmonized_fire_activity", "harmonized_frp_index"):
        invalid = frame.filter(
            pl.col(column).is_not_null()
            & (~pl.col(column).is_finite() | (pl.col(column) < 0) | (pl.col(column) > 1))
        ).height
        if invalid:
            raise ValueError(f"{column} must contain finite values in [0, 1]")
    if frame.select(pl.struct(["h3_cell", "acq_date"]).n_unique()).item() != frame.height:
        raise ValueError("Harmonized data contains duplicate h3_cell + acq_date rows")
    result = calculate_burn_index(frame)
    if result["burn_index"].null_count():
        raise ValueError("Every row must have at least one non-null harmonized index")
    return result


def validate_burn_index(source: pl.DataFrame, output: pl.DataFrame) -> BurnIndexValidation:
    """Validate score bounds/formula, row keys, sensor provenance, and count totals."""
    _require_columns(source)
    _require_columns(output, {
        "burn_index", "activity_component", "frp_component", "activity_weight",
        "frp_weight", "harmonized_activity_index",
    })
    null_required = output.filter(
        pl.col("h3_cell").is_null() | pl.col("acq_date").is_null() | pl.col("burn_index").is_null()
    ).height
    duplicate_rows = output.height - output.select(pl.struct(["h3_cell", "acq_date"]).n_unique()).item() if output.height else 0
    score_min = output["burn_index"].min() if output.height else None
    score_max = output["burn_index"].max() if output.height else None
    negative = output.filter(pl.col("burn_index") < 0).height
    out_of_bounds = output.filter((pl.col("burn_index") < 0) | (pl.col("burn_index") > INDEX_SCALE) | ~pl.col("burn_index").is_finite()).height
    component_columns = ["activity_component", "frp_component"]
    invalid_components = output.filter(pl.any_horizontal([
        pl.col(column).is_not_null()
        & (~pl.col(column).is_finite() | (pl.col(column) < 0) | (pl.col(column) > 1))
        for column in component_columns
    ])).height
    weight_sum = pl.col("activity_weight") + pl.col("frp_weight")
    invalid_weights = output.filter(
        pl.col("activity_weight").is_null()
        | pl.col("frp_weight").is_null()
        | ((weight_sum - 1.0).abs() > 1e-10)
        | (pl.col("activity_weight") < 0)
        | (pl.col("frp_weight") < 0)
    ).height
    expected_score = (
        pl.col("activity_component").fill_null(0.0) * pl.col("activity_weight").fill_null(0.0)
        + pl.col("frp_component").fill_null(0.0) * pl.col("frp_weight").fill_null(0.0)
    ) * INDEX_SCALE
    formula_mismatches = output.filter(
        (pl.col("burn_index") - expected_score).abs() > 1e-8
    ).height
    in_bounds = output.filter(
        pl.col("burn_index").is_not_null()
        & pl.col("burn_index").is_finite()
        & (pl.col("burn_index") >= 0)
        & (pl.col("burn_index") <= INDEX_SCALE)
    )
    modis_valid = in_bounds.filter(pl.col("sensor_presence") == "MODIS").height
    viirs_valid = in_bounds.filter(pl.col("sensor_presence") == "VIIRS").height
    both_valid = in_bounds.filter(pl.col("sensor_presence") == "MODIS+VIIRS").height
    expected_modis = pl.col("modis_fire_count") > 0
    expected_viirs = pl.col("viirs_fire_count") > 0
    expected_presence = (
        pl.when(expected_modis & expected_viirs).then(pl.lit("MODIS+VIIRS"))
        .when(expected_modis).then(pl.lit("MODIS"))
        .when(expected_viirs).then(pl.lit("VIIRS"))
        .otherwise(pl.lit("NONE"))
    )
    presence_mismatches = output.filter(pl.col("sensor_presence") != expected_presence).height
    category_totals = source.select(
        (expected_modis & ~expected_viirs).sum().alias("modis_only"),
        (~expected_modis & expected_viirs).sum().alias("viirs_only"),
        (expected_modis & expected_viirs).sum().alias("both"),
    ).row(0, named=True)
    input_counts = source.select(pl.col("modis_fire_count").sum(), pl.col("viirs_fire_count").sum()).row(0)
    output_counts = output.select(pl.col("modis_fire_count").sum(), pl.col("viirs_fire_count").sum()).row(0)
    preserve_columns = set(source.columns).issubset(output.columns)
    return BurnIndexValidation(
        input_rows=source.height,
        output_rows=output.height,
        row_conservation=source.height == output.height,
        duplicate_cell_date_rows=duplicate_rows,
        null_required_values=null_required,
        input_modis_count=int(input_counts[0] or 0),
        output_modis_count=int(output_counts[0] or 0),
        input_viirs_count=int(input_counts[1] or 0),
        output_viirs_count=int(output_counts[1] or 0),
        sensor_totals_conserved=input_counts == output_counts,
        burn_index_min=score_min,
        burn_index_max=score_max,
        negative_scores=negative,
        out_of_bounds_scores=out_of_bounds,
        invalid_components=invalid_components,
        invalid_effective_weights=invalid_weights,
        score_formula_mismatches=formula_mismatches,
        modis_only_valid_rows=modis_valid,
        viirs_only_valid_rows=viirs_valid,
        both_sensor_valid_rows=both_valid,
        modis_only_rows=int(category_totals["modis_only"] or 0),
        viirs_only_rows=int(category_totals["viirs_only"] or 0),
        both_sensor_rows=int(category_totals["both"] or 0),
        sensor_presence_mismatches=presence_mismatches,
        provenance_columns_preserved=preserve_columns,
    )


def ensure_valid_burn_index(validation: BurnIndexValidation) -> None:
    """Raise a detailed error if output score checks fail."""
    if not validation.is_valid:
        raise ValueError(f"Burn Index validation failed: {asdict(validation)}")
