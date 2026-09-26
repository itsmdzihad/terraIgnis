"""Unit tests for sensor-preserving daily H3 aggregation."""

from datetime import date
import unittest

import h3
import polars as pl

from app.services.spatial import (
    H3_RESOLUTION,
    aggregate_daily_h3,
    assign_h3_cells,
    coordinates_to_h3,
    validate_aggregation,
    validate_h3_cell_resolution,
)


def sample_observations() -> pl.DataFrame:
    """Create MODIS-only, VIIRS-only, and mixed sensor cell/date groups."""
    return pl.DataFrame({
        "latitude": [23.7, 23.7, 24.0, 24.2],
        "longitude": [90.4, 90.4, 90.8, 91.0],
        "acq_date": [date(2026, 9, 1)] * 4,
        "sensor": ["MODIS", "VIIRS", "MODIS", "VIIRS"],
        "frp": [10.0, 3.0, 5.0, 7.0],
        "brightness": [320.0, 350.0, 310.0, 360.0],
        "brightness_longwave": [290.0, 300.0, 285.0, 305.0],
        "scan": [1.0, 0.5, 1.2, 0.6],
        "track": [1.0, 0.5, 1.1, 0.7],
        "daynight": ["D", "N", "D", "N"],
        "confidence_raw": ["70", "nominal", "80", "high"],
        "confidence_numeric": [70.0, None, 80.0, None],
    })


class SpatialAggregationTests(unittest.TestCase):
    def test_coordinate_conversion_and_resolution(self) -> None:
        cell = coordinates_to_h3(23.7, 90.4, H3_RESOLUTION)
        self.assertEqual(h3.get_resolution(cell), H3_RESOLUTION)
        result = assign_h3_cells(sample_observations(), H3_RESOLUTION)
        self.assertEqual(result["h3_cell"][0], cell)
        self.assertTrue(validate_h3_cell_resolution(result, H3_RESOLUTION))

    def test_mixed_sensor_counts_metrics_and_confidence(self) -> None:
        aggregate = aggregate_daily_h3(sample_observations())
        mixed = aggregate.filter(pl.col("h3_cell") == coordinates_to_h3(23.7, 90.4))
        self.assertEqual(mixed.height, 1)
        row = mixed.row(0, named=True)
        self.assertEqual(row["total_fire_count"], 2)
        self.assertEqual(row["modis_fire_count"], 1)
        self.assertEqual(row["viirs_fire_count"], 1)
        self.assertEqual(row["total_frp"], 13.0)
        self.assertEqual(row["modis_frp_sum"], 10.0)
        self.assertEqual(row["viirs_frp_sum"], 3.0)
        self.assertEqual(row["modis_frp_mean"], 10.0)
        self.assertEqual(row["viirs_frp_mean"], 3.0)
        self.assertEqual(row["day_fire_count"], 1)
        self.assertEqual(row["night_fire_count"], 1)
        self.assertEqual(row["modis_confidence_mean"], 70.0)
        self.assertEqual(row["viirs_nominal_confidence_count"], 1)
        self.assertEqual(row["viirs_low_confidence_count"], 0)
        self.assertEqual(row["viirs_high_confidence_count"], 0)

    def test_sensor_only_cells_keep_counts_and_null_sensor_metrics(self) -> None:
        aggregate = aggregate_daily_h3(sample_observations())
        modis_cell = aggregate.filter(pl.col("h3_cell") == coordinates_to_h3(24.0, 90.8)).row(0, named=True)
        viirs_cell = aggregate.filter(pl.col("h3_cell") == coordinates_to_h3(24.2, 91.0)).row(0, named=True)
        self.assertEqual((modis_cell["modis_fire_count"], modis_cell["viirs_fire_count"]), (1, 0))
        self.assertEqual(modis_cell["viirs_frp_sum"], None)
        self.assertEqual(modis_cell["viirs_brightness_mean"], None)
        self.assertEqual(modis_cell["viirs_high_confidence_count"], 0)
        self.assertEqual((viirs_cell["modis_fire_count"], viirs_cell["viirs_fire_count"]), (0, 1))
        self.assertEqual(viirs_cell["modis_frp_sum"], None)
        self.assertEqual(viirs_cell["modis_brightness_mean"], None)
        self.assertEqual(viirs_cell["modis_confidence_mean"], None)
        self.assertEqual(viirs_cell["viirs_high_confidence_count"], 1)

    def test_record_and_frp_conservation(self) -> None:
        observations = sample_observations()
        aggregate = aggregate_daily_h3(observations)
        result = validate_aggregation(aggregate, observations.height)
        self.assertTrue(result.is_valid)
        self.assertEqual(result.input_records, 4)
        self.assertEqual(result.represented_records, 4)
        self.assertEqual(result.output_rows, 3)
        self.assertEqual(result.null_h3_cells, 0)
        self.assertEqual(result.null_acq_dates, 0)
        self.assertEqual(result.count_mismatches, 0)
        self.assertEqual(result.frp_mismatches, 0)


if __name__ == "__main__":
    unittest.main()
