"""Tests for date-relative robust wildfire anomaly scores."""

from datetime import date, timedelta
import unittest

import polars as pl

from app.services.anomaly import (
    build_anomaly_dataset,
    calculate_daily_baseline,
    calculate_percentile,
    classify_anomaly,
    validate_anomalies,
)


def burn_rows(
    values: list[float],
    day: date = date(2026, 9, 1),
    presence: list[str] | None = None,
) -> pl.DataFrame:
    count = len(values)
    presences = presence or ["VIIRS"] * count
    return pl.DataFrame({
        "h3_cell": [f"cell-{i}" for i in range(count)],
        "acq_date": [day] * count,
        "burn_index": values,
        "sensor_presence": presences,
        "sensor_count": [2 if x == "MODIS+VIIRS" else 1 for x in presences],
        "modis_fire_count": [1 if x in ("MODIS", "MODIS+VIIRS") else 0 for x in presences],
        "viirs_fire_count": [1 if x in ("VIIRS", "MODIS+VIIRS") else 0 for x in presences],
        "total_fire_count": [1 if x != "MODIS+VIIRS" else 2 for x in presences],
    })


class AnomalyTests(unittest.TestCase):
    def test_normal_daily_distribution(self) -> None:
        output = build_anomaly_dataset(burn_rows([40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60]))
        self.assertTrue((output["anomaly_level"] == "normal").all())
        self.assertTrue((output["baseline_method"] == "daily_mad").all())

    def test_high_anomaly(self) -> None:
        values = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 100]
        output = build_anomaly_dataset(burn_rows(values))
        high = output.filter(pl.col("burn_index") == 100).row(0, named=True)
        self.assertGreater(high["robust_z_score"], 3)
        self.assertEqual(high["anomaly_level"], "extreme_high")

    def test_low_anomaly_is_relative_not_fire_free(self) -> None:
        values = [0, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60]
        output = build_anomaly_dataset(burn_rows(values))
        low = output.filter(pl.col("burn_index") == 0).row(0, named=True)
        self.assertLess(low["robust_z_score"], -3)
        self.assertEqual(low["anomaly_level"], "extreme_low")
        self.assertEqual(low["total_fire_count"], 1)

    def test_extreme_anomaly_levels_are_detected(self) -> None:
        values = [0, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 100]
        levels = build_anomaly_dataset(burn_rows(values))["anomaly_level"].to_list()
        self.assertIn("extreme_low", levels)
        self.assertIn("extreme_high", levels)

    def test_identical_daily_values_have_unavailable_z_and_middle_percentile(self) -> None:
        output = build_anomaly_dataset(burn_rows([25.0] * 4))
        self.assertTrue((output["baseline_method"] == "unavailable").all())
        self.assertTrue((output["robust_z_score"].is_null()).all())
        self.assertTrue((output["anomaly_level"] == "unavailable").all())
        self.assertTrue((output["anomaly_percentile"] == 0.5).all())

    def test_mad_zero_falls_back_to_daily_standard_deviation(self) -> None:
        output = build_anomaly_dataset(burn_rows([10.0] * 9 + [20.0]))
        self.assertTrue((output["baseline_method"] == "daily_std_fallback").all())
        self.assertTrue(output["robust_z_score"].is_finite().all())

    def test_very_small_mad_does_not_create_unstable_scores(self) -> None:
        values = [10.0 + i * 1e-8 for i in range(10)]
        output = build_anomaly_dataset(burn_rows(values))
        self.assertTrue((output["baseline_method"] == "unavailable").all())
        self.assertTrue(output["robust_z_score"].is_null().all())

    def test_single_observation_date_uses_safe_fallback(self) -> None:
        output = build_anomaly_dataset(burn_rows([50.0]))
        self.assertEqual(output["anomaly_percentile"][0], 0.5)
        self.assertIsNone(output["robust_z_score"][0])
        self.assertEqual(output["anomaly_level"][0], "unavailable")

    def test_percentile_rank_is_deterministic_and_maps_ties_to_average_rank(self) -> None:
        ranked = calculate_percentile(burn_rows([1.0, 2.0, 2.0, 4.0]))
        self.assertEqual(ranked["anomaly_percentile"].to_list(), [0.0, 0.5, 0.5, 1.0])

    def test_tied_values_receive_same_percentile(self) -> None:
        ranked = calculate_percentile(burn_rows([5.0, 5.0, 5.0]))
        self.assertEqual(ranked["anomaly_percentile"].to_list(), [0.5, 0.5, 0.5])

    def test_missing_optional_sensor_metrics_do_not_block_scoring(self) -> None:
        source = burn_rows([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
        output = build_anomaly_dataset(source)
        self.assertEqual(output.height, source.height)
        self.assertFalse(output["robust_z_score"].is_infinite().any())

    def test_modis_only_viirs_only_and_both_are_preserved(self) -> None:
        source = burn_rows([10, 20, 30], presence=["MODIS", "VIIRS", "MODIS+VIIRS"])
        output = build_anomaly_dataset(source)
        self.assertEqual(output["sensor_presence"].to_list(), ["MODIS", "VIIRS", "MODIS+VIIRS"])
        self.assertEqual(output["robust_z_score"].null_count(), 3)  # date is too small for a daily baseline

    def test_duplicate_h3_date_is_detected(self) -> None:
        source = burn_rows([10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
        duplicate = pl.concat([source, source.head(1)])
        intermediate = calculate_daily_baseline(duplicate)
        from app.services.anomaly import calculate_robust_z_score
        output = calculate_robust_z_score(intermediate)
        output = calculate_percentile(output)
        output = classify_anomaly(output)
        validation = validate_anomalies(duplicate, output)
        self.assertEqual(validation.duplicate_cell_date_rows, 1)
        self.assertFalse(validation.is_valid)

    def test_input_output_row_and_key_conservation(self) -> None:
        source = burn_rows([40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60])
        output = build_anomaly_dataset(source)
        validation = validate_anomalies(source, output)
        self.assertTrue(validation.is_valid)
        self.assertTrue(validation.row_conservation)
        self.assertEqual(validation.input_rows, validation.output_rows)
        self.assertEqual(validation.fabricated_cell_date_rows, 0)
        self.assertEqual(validation.missing_cell_date_rows, 0)

    def test_no_infinite_scores_or_percentiles(self) -> None:
        output = build_anomaly_dataset(burn_rows([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]))
        validation = validate_anomalies(burn_rows([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]), output)
        self.assertEqual(validation.infinite_score_rows, 0)
        self.assertEqual(validation.invalid_percentile_rows, 0)

    def test_threshold_classification_boundaries(self) -> None:
        classified = classify_anomaly(pl.DataFrame({
            "robust_z_score": [-3.1, -3.0, -2.1, -2.0, 2.0, 2.1, 3.0, 3.1, None]
        }))
        self.assertEqual(classified["anomaly_level"].to_list(), [
            "extreme_low", "low", "low", "normal", "normal", "high", "high", "extreme_high", "unavailable"
        ])


if __name__ == "__main__":
    unittest.main()
