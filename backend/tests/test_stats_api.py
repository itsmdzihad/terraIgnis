"""Integration tests for the dashboard statistics endpoint."""

import asyncio
import unittest
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient

from app.core.database import DatasetUnavailableError, fetch_one, get_dataset_path
from app.main import app
from app.schemas.stats import StatsResponse


class StatsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.raw_path = get_dataset_path("standardized_fires")
        cls.h3_path = get_dataset_path("h3_fire_daily")
        cls.harmonized_path = get_dataset_path("harmonized_fire")
        cls.burn_path = get_dataset_path("burn_index")
        cls.anomaly_path = get_dataset_path("anomalies")
        cls.raw = fetch_one(
            "SELECT count(*) AS total_raw_observations, "
            "count(*) FILTER (WHERE sensor = 'MODIS') AS modis_observations, "
            "count(*) FILTER (WHERE sensor = 'VIIRS') AS viirs_observations "
            "FROM read_parquet(?)",
            [cls.raw_path],
        )
        cls.coverage = fetch_one(
            "SELECT count(*) AS total_h3_cell_dates, count(DISTINCT h3_cell) AS unique_h3_cells, "
            "count(DISTINCT acq_date) AS observed_dates, min(acq_date) AS start_date, "
            "max(acq_date) AS end_date FROM read_parquet(?)",
            [cls.h3_path],
        )
        cls.sensor_presence = fetch_one(
            "SELECT count(*) FILTER (WHERE sensor_presence = 'MODIS') AS modis_only_cell_dates, "
            "count(*) FILTER (WHERE sensor_presence = 'VIIRS') AS viirs_only_cell_dates, "
            "count(*) FILTER (WHERE sensor_presence = 'MODIS+VIIRS') AS both_sensor_cell_dates "
            "FROM read_parquet(?)",
            [cls.harmonized_path],
        )
        cls.burn = fetch_one(
            "SELECT min(burn_index) AS minimum, max(burn_index) AS maximum, "
            "avg(burn_index) AS mean, median(burn_index) AS median, "
            "quantile_cont(burn_index, 0.95) AS p95 FROM read_parquet(?)",
            [cls.burn_path],
        )
        cls.anomaly = fetch_one(
            "SELECT count(*) FILTER (WHERE anomaly_level = 'normal') AS normal, "
            "count(*) FILTER (WHERE anomaly_level = 'low') AS low, "
            "count(*) FILTER (WHERE anomaly_level = 'high') AS high, "
            "count(*) FILTER (WHERE anomaly_level = 'extreme_low') AS extreme_low, "
            "count(*) FILTER (WHERE anomaly_level = 'extreme_high') AS extreme_high "
            "FROM read_parquet(?)",
            [cls.anomaly_path],
        )

    def request(self, path: str):
        async def send():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                return await client.get(path)

        return asyncio.run(send())

    def stats(self):
        response = self.request("/api/stats")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_get_stats_returns_200(self) -> None:
        self.assertEqual(self.request("/api/stats").status_code, 200)

    def test_response_matches_pydantic_schema_and_is_structured(self) -> None:
        parsed = StatsResponse.model_validate(self.stats())
        self.assertEqual(set(parsed.model_dump().keys()), {"coverage", "sensors", "burn_index", "anomalies"})

    def test_total_raw_observation_count(self) -> None:
        self.assertEqual(self.stats()["coverage"]["total_raw_observations"], self.raw["total_raw_observations"])

    def test_total_h3_cell_date_count(self) -> None:
        self.assertEqual(self.stats()["coverage"]["total_h3_cell_dates"], self.coverage["total_h3_cell_dates"])

    def test_unique_h3_cell_count(self) -> None:
        self.assertEqual(self.stats()["coverage"]["unique_h3_cells"], self.coverage["unique_h3_cells"])

    def test_observed_date_count(self) -> None:
        self.assertEqual(self.stats()["coverage"]["observed_dates"], self.coverage["observed_dates"])

    def test_start_and_end_dates(self) -> None:
        coverage = self.stats()["coverage"]
        self.assertEqual(coverage["start_date"], str(self.coverage["start_date"]))
        self.assertEqual(coverage["end_date"], str(self.coverage["end_date"]))

    def test_h3_resolution_is_derived_from_a_dataset_cell(self) -> None:
        self.assertEqual(self.stats()["coverage"]["h3_resolution"], 7)

    def test_modis_raw_observation_count(self) -> None:
        self.assertEqual(self.stats()["sensors"]["modis_observations"], self.raw["modis_observations"])

    def test_viirs_raw_observation_count(self) -> None:
        self.assertEqual(self.stats()["sensors"]["viirs_observations"], self.raw["viirs_observations"])

    def test_modis_only_cell_date_count(self) -> None:
        self.assertEqual(self.stats()["sensors"]["modis_only_cell_dates"], self.sensor_presence["modis_only_cell_dates"])

    def test_viirs_only_cell_date_count(self) -> None:
        self.assertEqual(self.stats()["sensors"]["viirs_only_cell_dates"], self.sensor_presence["viirs_only_cell_dates"])

    def test_both_sensor_cell_date_count(self) -> None:
        self.assertEqual(self.stats()["sensors"]["both_sensor_cell_dates"], self.sensor_presence["both_sensor_cell_dates"])

    def test_burn_index_minimum_and_maximum(self) -> None:
        burn = self.stats()["burn_index"]
        self.assertEqual(burn["minimum"], self.burn["minimum"])
        self.assertEqual(burn["maximum"], self.burn["maximum"])

    def test_burn_index_mean_and_median(self) -> None:
        burn = self.stats()["burn_index"]
        self.assertAlmostEqual(burn["mean"], self.burn["mean"])
        self.assertEqual(burn["median"], self.burn["median"])

    def test_burn_index_p95(self) -> None:
        self.assertEqual(self.stats()["burn_index"]["p95"], self.burn["p95"])

    def test_each_anomaly_level_count(self) -> None:
        actual = self.stats()["anomalies"]
        for level in ("normal", "low", "high", "extreme_low", "extreme_high"):
            with self.subTest(level=level):
                self.assertEqual(actual[level], self.anomaly[level])

    def test_total_anomalous_is_sum_of_non_normal_levels(self) -> None:
        actual = self.stats()["anomalies"]
        expected = sum(self.anomaly[level] for level in ("low", "high", "extreme_low", "extreme_high"))
        self.assertEqual(actual["total_anomalous"], expected)

    def test_missing_required_dataset_error_is_sanitized(self) -> None:
        with patch(
            "app.api.stats.get_dataset_path",
            side_effect=DatasetUnavailableError("/secret/path/standardized_fires.parquet"),
        ):
            response = self.request("/api/stats")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("/secret/path", response.text)
        self.assertNotIn("standardized_fires.parquet", response.text)


if __name__ == "__main__":
    unittest.main()
