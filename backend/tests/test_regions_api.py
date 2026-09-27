"""Integration tests for H3 spatial summary endpoint."""

import asyncio
import unittest
from datetime import timedelta
from unittest.mock import patch

import h3
from httpx import ASGITransport, AsyncClient

from app.core.database import DatasetUnavailableError, fetch_all, fetch_one, get_dataset_path
from app.main import app
from app.schemas.regions import H3RegionSummary


class RegionsApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset_path = get_dataset_path("anomalies")
        cls.sample_cell = fetch_one(
            "SELECT h3_cell FROM read_parquet(?) GROUP BY h3_cell "
            "HAVING count(*) > 1 ORDER BY h3_cell LIMIT 1",
            [cls.dataset_path],
        )["h3_cell"]
        cls.cell_dates = fetch_all(
            "SELECT acq_date FROM read_parquet(?) WHERE h3_cell = ? ORDER BY acq_date",
            [cls.dataset_path, cls.sample_cell],
        )
        cls.unobserved_cell = None
        for lat, lon in ((89, 0), (-89, 0), (0, 0), (60, 160), (-60, -160)):
            candidate = h3.latlng_to_cell(lat, lon, 7)
            count = fetch_one(
                "SELECT count(*) AS n FROM read_parquet(?) WHERE h3_cell = ?",
                [cls.dataset_path, candidate],
            )["n"]
            if count == 0:
                cls.unobserved_cell = candidate
                break
        if cls.unobserved_cell is None:
            raise RuntimeError("Could not find an unobserved valid H3 test cell")

    def request(self, path: str):
        async def send():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                return await client.get(path)

        return asyncio.run(send())

    def test_valid_h3_request_returns_200(self) -> None:
        response = self.request(f"/api/regions/{self.sample_cell}")
        self.assertEqual(response.status_code, 200)

    def test_response_matches_pydantic_schema(self) -> None:
        response = self.request(f"/api/regions/{self.sample_cell}")
        parsed = H3RegionSummary.model_validate(response.json())
        self.assertEqual(parsed.h3_cell, self.sample_cell)
        self.assertGreater(parsed.observed_cell_dates, 0)

    def test_invalid_h3_identifier_is_rejected(self) -> None:
        self.assertEqual(self.request("/api/regions/not-an-h3-cell").status_code, 422)

    def test_wrong_h3_resolution_is_rejected(self) -> None:
        wrong_resolution = h3.latlng_to_cell(0, 0, 6)
        self.assertEqual(self.request(f"/api/regions/{wrong_resolution}").status_code, 422)

    def test_known_h3_cell_returns_expected_summary(self) -> None:
        response = self.request(f"/api/regions/{self.sample_cell}")
        self.assertEqual(response.status_code, 200)
        actual = response.json()
        expected = fetch_one(
            "SELECT h3_cell, count(*) AS observed_cell_dates, min(acq_date) AS first_observed_date, "
            "max(acq_date) AS last_observed_date, sum(total_fire_count) AS total_fire_detections, "
            "avg(burn_index) AS mean_burn_index, max(burn_index) AS max_burn_index, "
            "min(burn_index) AS min_burn_index, "
            "count(*) FILTER (WHERE anomaly_level <> 'normal') AS anomaly_count, "
            "count(*) FILTER (WHERE anomaly_level IN ('extreme_low', 'extreme_high')) AS extreme_anomaly_count, "
            "sum(modis_fire_count) AS modis_fire_detections, "
            "sum(viirs_fire_count) AS viirs_fire_detections "
            "FROM read_parquet(?) WHERE h3_cell = ? GROUP BY h3_cell",
            [self.dataset_path, self.sample_cell],
        )
        expected["first_observed_date"] = str(expected["first_observed_date"])
        expected["last_observed_date"] = str(expected["last_observed_date"])
        self.assertEqual(actual, expected)

    def test_valid_unknown_h3_cell_returns_not_found(self) -> None:
        response = self.request(f"/api/regions/{self.unobserved_cell}")
        self.assertEqual(response.status_code, 404)
        self.assertIn("No observations", response.json()["detail"])

    def test_start_date_filter(self) -> None:
        target = self.cell_dates[0]["acq_date"]
        response = self.request(f"/api/regions/{self.sample_cell}?start_date={target}")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.json()["first_observed_date"], str(target))

    def test_end_date_filter(self) -> None:
        target = self.cell_dates[-1]["acq_date"]
        response = self.request(f"/api/regions/{self.sample_cell}?end_date={target}")
        self.assertEqual(response.status_code, 200)
        self.assertLessEqual(response.json()["last_observed_date"], str(target))

    def test_date_range_filters_only_observed_records(self) -> None:
        start = self.cell_dates[0]["acq_date"]
        end = self.cell_dates[-1]["acq_date"]
        response = self.request(
            f"/api/regions/{self.sample_cell}?start_date={start}&end_date={end}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["observed_cell_dates"], len(self.cell_dates))

    def test_invalid_date_range_is_rejected(self) -> None:
        date = self.cell_dates[0]["acq_date"]
        response = self.request(
            f"/api/regions/{self.sample_cell}?start_date={date + timedelta(days=1)}&end_date={date}"
        )
        self.assertEqual(response.status_code, 422)

    def test_invalid_date_is_rejected(self) -> None:
        self.assertEqual(self.request(f"/api/regions/{self.sample_cell}?start_date=not-a-date").status_code, 422)

    def test_anomaly_and_extreme_counts_match_source(self) -> None:
        actual = self.request(f"/api/regions/{self.sample_cell}").json()
        expected = fetch_one(
            "SELECT count(*) FILTER (WHERE anomaly_level <> 'normal') AS anomaly_count, "
            "count(*) FILTER (WHERE anomaly_level IN ('extreme_low', 'extreme_high')) AS extreme_anomaly_count "
            "FROM read_parquet(?) WHERE h3_cell = ?",
            [self.dataset_path, self.sample_cell],
        )
        self.assertEqual(actual["anomaly_count"], expected["anomaly_count"])
        self.assertEqual(actual["extreme_anomaly_count"], expected["extreme_anomaly_count"])

    def test_sensor_counts_match_h3_aggregates(self) -> None:
        actual = self.request(f"/api/regions/{self.sample_cell}").json()
        expected = fetch_one(
            "SELECT sum(modis_fire_count) AS modis_fire_detections, "
            "sum(viirs_fire_count) AS viirs_fire_detections "
            "FROM read_parquet(?) WHERE h3_cell = ?",
            [self.dataset_path, self.sample_cell],
        )
        self.assertEqual(actual["modis_fire_detections"], expected["modis_fire_detections"])
        self.assertEqual(actual["viirs_fire_detections"], expected["viirs_fire_detections"])

    def test_missing_dataset_error_is_sanitized(self) -> None:
        with patch(
            "app.api.regions.get_dataset_path",
            side_effect=DatasetUnavailableError("/secret/path/anomalies.parquet"),
        ):
            response = self.request(f"/api/regions/{self.sample_cell}")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("/secret/path", response.text)
        self.assertNotIn("anomalies.parquet", response.text)


if __name__ == "__main__":
    unittest.main()
