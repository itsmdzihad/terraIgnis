"""Tests for the bounded relative Burn Index composite."""

from datetime import date
import unittest

import polars as pl

from app.services.burn_index import (
    build_burn_index,
    calculate_burn_index,
    inspect_harmonized_data,
    validate_burn_index,
)


def harmonized_sample() -> pl.DataFrame:
    return pl.DataFrame({
        "h3_cell": ["cell-a", "cell-b", "cell-c", "cell-d"],
        "acq_date": [date(2026, 8, 1)] * 4,
        "sensor_presence": ["MODIS", "VIIRS", "MODIS+VIIRS", "MODIS+VIIRS"],
        "sensor_count": [1, 1, 2, 2],
        "modis_has_detections": [True, False, True, True],
        "viirs_has_detections": [False, True, True, True],
        "modis_fire_count": [1, 0, 2, 3],
        "viirs_fire_count": [0, 1, 1, 2],
        "harmonized_fire_activity": [0.2, 0.1, 0.8, 0.99],
        "harmonized_frp_index": [0.3, 0.15, 0.9, 0.95],
    })


class BurnIndexTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = harmonized_sample()
        self.output = build_burn_index(self.source)

    def test_normal_activity_and_frp_use_documented_weights(self) -> None:
        row = self.output.row(0, named=True)
        self.assertEqual(row["activity_weight"], 0.6)
        self.assertEqual(row["frp_weight"], 0.4)
        self.assertAlmostEqual(row["burn_index"], 24.0)

    def test_low_activity_and_low_frp_produce_low_score(self) -> None:
        self.assertAlmostEqual(self.output["burn_index"][1], 12.0)

    def test_high_activity_and_high_frp_produce_high_score(self) -> None:
        self.assertAlmostEqual(self.output["burn_index"][3], 97.4)

    def test_modis_only_viirs_only_and_both_rows_are_scored(self) -> None:
        self.assertEqual(self.output.filter(pl.col("sensor_presence") == "MODIS").height, 1)
        self.assertEqual(self.output.filter(pl.col("sensor_presence") == "VIIRS").height, 1)
        self.assertEqual(self.output.filter(pl.col("sensor_presence") == "MODIS+VIIRS").height, 2)
        self.assertEqual(self.output["burn_index"].null_count(), 0)

    def test_sensor_presence_does_not_double_score(self) -> None:
        row = self.output.row(2, named=True)
        expected = 100 * (0.6 * 0.8 + 0.4 * 0.9)
        self.assertAlmostEqual(row["burn_index"], expected)
        self.assertLess(row["burn_index"], 100 * (0.8 + 0.9))

    def test_missing_optional_component_renormalizes_remaining_weight(self) -> None:
        row = self.source.with_columns(
            pl.when(pl.col("h3_cell") == "cell-b")
            .then(None).otherwise(pl.col("harmonized_frp_index"))
            .alias("harmonized_frp_index")
        )
        output = calculate_burn_index(row)
        only_activity = output.filter(pl.col("h3_cell") == "cell-b").row(0, named=True)
        self.assertEqual(only_activity["activity_weight"], 1.0)
        self.assertEqual(only_activity["frp_weight"], 0.0)
        self.assertAlmostEqual(only_activity["burn_index"], 10.0)
        self.assertIsNone(only_activity["frp_component"])

    def test_outlier_at_component_bound_remains_bounded(self) -> None:
        outlier = self.source.with_columns(
            pl.when(pl.col("h3_cell") == "cell-d").then(1.0)
            .otherwise(pl.col("harmonized_fire_activity")).alias("harmonized_fire_activity"),
            pl.when(pl.col("h3_cell") == "cell-d").then(1.0)
            .otherwise(pl.col("harmonized_frp_index")).alias("harmonized_frp_index"),
        )
        output = build_burn_index(outlier)
        self.assertEqual(output.filter(pl.col("h3_cell") == "cell-d")["burn_index"][0], 100.0)
        self.assertTrue(output.filter(pl.col("burn_index") > 100).is_empty())

    def test_lower_bound_is_zero(self) -> None:
        zeros = self.source.with_columns(
            pl.lit(0.0).alias("harmonized_fire_activity"),
            pl.lit(0.0).alias("harmonized_frp_index"),
        )
        self.assertTrue((calculate_burn_index(zeros)["burn_index"] == 0).all())

    def test_upper_bound_is_one_hundred(self) -> None:
        ones = self.source.with_columns(
            pl.lit(1.0).alias("harmonized_fire_activity"),
            pl.lit(1.0).alias("harmonized_frp_index"),
        )
        self.assertTrue((calculate_burn_index(ones)["burn_index"] == 100).all())

    def test_duplicate_cell_date_is_detected(self) -> None:
        duplicate = pl.concat([self.source, self.source.head(1)])
        inspection = inspect_harmonized_data(duplicate)
        self.assertFalse(inspection.complete_cell_date_grid)
        output = calculate_burn_index(duplicate)
        validation = validate_burn_index(duplicate, output)
        self.assertEqual(validation.duplicate_cell_date_rows, 1)
        self.assertFalse(validation.is_valid)

    def test_row_and_sensor_totals_are_conserved(self) -> None:
        validation = validate_burn_index(self.source, self.output)
        self.assertTrue(validation.is_valid)
        self.assertTrue(validation.row_conservation)
        self.assertTrue(validation.sensor_totals_conserved)
        self.assertTrue(validation.provenance_columns_preserved)
        self.assertEqual(validation.input_rows, validation.output_rows)

    def test_invalid_out_of_range_component_is_rejected(self) -> None:
        invalid = self.source.with_columns(
            pl.when(pl.col("h3_cell") == "cell-a").then(1.5)
            .otherwise(pl.col("harmonized_fire_activity")).alias("harmonized_fire_activity")
        )
        with self.assertRaises(ValueError):
            build_burn_index(invalid)


if __name__ == "__main__":
    unittest.main()
