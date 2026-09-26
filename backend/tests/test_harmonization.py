"""Tests for sensor-preserving H3 harmonization metrics."""

from datetime import date
import unittest

import h3
import polars as pl

from app.services.harmonization import (
    build_harmonized_dataset,
    calculate_harmonized_metrics,
    calculate_sensor_metrics,
    inspect_h3_data,
    validate_harmonized_dataset,
)


def sample_h3_data() -> pl.DataFrame:
    """Return one MODIS-only, one VIIRS-only, and one dual-sensor cell/date."""
    cells = [
        h3.latlng_to_cell(23.7, 90.4, 7),
        h3.latlng_to_cell(24.2, 91.0, 7),
        h3.latlng_to_cell(25.0, 92.0, 7),
    ]
    return pl.DataFrame({
        "h3_cell": cells,
        "acq_date": [date(2026, 9, 1)] * 3,
        "total_fire_count": [1, 2, 3],
        "modis_fire_count": [1, 0, 2],
        "viirs_fire_count": [0, 2, 1],
        "total_frp": [10.0, 12.0, 23.0],
        "modis_frp_sum": [10.0, None, 20.0],
        "viirs_frp_sum": [None, 12.0, 3.0],
        "modis_frp_mean": [10.0, None, 10.0],
        "viirs_frp_mean": [None, 6.0, 3.0],
        "modis_brightness_mean": [320.0, None, 330.0],
        "viirs_brightness_mean": [None, 350.0, 360.0],
        "modis_brightness_longwave_mean": [290.0, None, 300.0],
        "viirs_brightness_longwave_mean": [None, 300.0, 305.0],
        "modis_mean_scan": [1.0, None, 2.0],
        "viirs_mean_scan": [None, 0.5, 0.5],
        "modis_mean_track": [1.0, None, 1.0],
        "viirs_mean_track": [None, 0.5, 0.5],
        "day_fire_count": [1, 1, 2],
        "night_fire_count": [0, 1, 1],
        "modis_confidence_mean": [70.0, None, 80.0],
        "viirs_low_confidence_count": [0, 0, 0],
        "viirs_nominal_confidence_count": [0, 2, 1],
        "viirs_high_confidence_count": [0, 0, 0],
    })


class HarmonizationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.source = sample_h3_data()
        self.output = build_harmonized_dataset(self.source)

    def test_sensor_presence_classification_and_single_sensor_rows(self) -> None:
        self.assertEqual(self.output["sensor_presence"].to_list(), ["MODIS", "VIIRS", "MODIS+VIIRS"])
        self.assertEqual(self.output["sensor_count"].to_list(), [1, 1, 2])
        self.assertEqual(self.output["modis_has_detections"].to_list(), [True, False, True])
        self.assertEqual(self.output["viirs_has_detections"].to_list(), [False, True, True])

    def test_missing_sensor_metrics_remain_null_and_counts_are_zero(self) -> None:
        modis_only, viirs_only = self.output.head(2).to_dicts()
        self.assertIsNone(modis_only["viirs_frp_sum"])
        self.assertIsNone(modis_only["viirs_fire_density"])
        self.assertIsNone(modis_only["viirs_frp_index"])
        self.assertEqual(modis_only["viirs_nominal_confidence_count"], 0)
        self.assertIsNone(viirs_only["modis_frp_sum"])
        self.assertIsNone(viirs_only["modis_fire_density"])
        self.assertIsNone(viirs_only["modis_frp_index"])
        self.assertIsNone(viirs_only["modis_confidence_mean"])

    def test_sensor_density_uses_mean_scan_times_track(self) -> None:
        metrics = calculate_sensor_metrics(self.source)
        first = metrics.row(0, named=True)
        self.assertEqual(first["modis_effective_footprint_km2"], 1.0)
        self.assertEqual(first["modis_fire_density"], 1.0)
        self.assertIsNone(first["viirs_fire_density"])
        self.assertEqual(metrics["viirs_fire_density"][1], 8.0)

    def test_harmonized_activity_is_sensor_balanced_mean_of_percentiles(self) -> None:
        both = self.output.row(2, named=True)
        expected = (both["modis_fire_activity_index"] + both["viirs_fire_activity_index"]) / 2
        self.assertAlmostEqual(both["harmonized_fire_activity"], expected)
        self.assertNotEqual(
            both["harmonized_fire_activity"],
            both["modis_fire_activity_index"] + both["viirs_fire_activity_index"],
        )
        self.assertTrue(0 <= both["harmonized_fire_activity"] <= 1)

    def test_frp_density_and_normalized_frp_index(self) -> None:
        both = self.output.row(2, named=True)
        self.assertEqual(both["modis_frp_density"], 10.0)
        self.assertEqual(both["viirs_frp_density"], 12.0)
        expected = (both["modis_frp_index"] + both["viirs_frp_index"]) / 2
        self.assertAlmostEqual(both["harmonized_frp_index"], expected)
        self.assertTrue(0 <= both["harmonized_frp_index"] <= 1)

    def test_harmonized_values_are_nonnegative(self) -> None:
        for column in ("harmonized_fire_activity", "harmonized_frp_index"):
            self.assertTrue(self.output.filter(pl.col(column) < 0).is_empty())

    def test_counts_frp_and_original_sensor_columns_are_conserved(self) -> None:
        validation = validate_harmonized_dataset(self.source, self.output)
        self.assertTrue(validation.is_valid)
        self.assertEqual(validation.input_rows, 3)
        self.assertEqual(validation.output_rows, 3)
        self.assertEqual(validation.modis_count_input, 3)
        self.assertEqual(validation.modis_count_output, 3)
        self.assertEqual(validation.viirs_count_input, 3)
        self.assertEqual(validation.viirs_count_output, 3)
        self.assertAlmostEqual(validation.modis_frp_input, validation.modis_frp_output)
        self.assertAlmostEqual(validation.viirs_frp_input, validation.viirs_frp_output)
        self.assertTrue(validation.preserved_input_columns)

    def test_duplicate_cell_date_rows_are_reported(self) -> None:
        duplicated = pl.concat([self.source, self.source.head(1)])
        inspection = inspect_h3_data(duplicated)
        self.assertEqual(inspection.quality_checks["duplicate_h3_cell_date_rows"], 1)
        validation = validate_harmonized_dataset(duplicated, pl.concat([self.output, self.output.head(1)]))
        self.assertFalse(validation.is_valid)
        self.assertEqual(validation.duplicate_cell_date_rows, 1)

    def test_viirs_confidence_is_preserved_as_categorical_counts(self) -> None:
        both = self.output.row(2, named=True)
        self.assertEqual(both["viirs_nominal_confidence_count"], 1)
        self.assertEqual(both["viirs_high_confidence_count"], 0)
        self.assertFalse(any("numeric_confidence" in name for name in self.output.columns))


if __name__ == "__main__":
    unittest.main()
