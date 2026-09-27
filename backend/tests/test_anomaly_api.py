"""Integration tests for anomaly observation and H3 history endpoints."""

import asyncio
import unittest
from datetime import timedelta
from unittest.mock import patch

import h3
from httpx import ASGITransport, AsyncClient

from app.api.anomaly import ANOMALY_COLUMNS
from app.core.database import DatasetUnavailableError, fetch_all, fetch_one, get_dataset_path
from app.main import app
from app.schemas.anomaly import AnomaliesResponse


class AnomalyApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset_path = get_dataset_path("anomalies")
        cls.sample = fetch_one(
            "SELECT h3_cell, acq_date, burn_index, robust_z_score, anomaly_level "
            "FROM read_parquet(?) ORDER BY acq_date, h3_cell LIMIT 1",
            [cls.dataset_path],
        )
        cls.high = fetch_one(
            "SELECT h3_cell, acq_date, robust_z_score, burn_index "
            "FROM read_parquet(?) WHERE anomaly_level = 'extreme_high' "
            "ORDER BY acq_date DESC, robust_z_score DESC LIMIT 1",
            [cls.dataset_path],
        )
        cls.dates = fetch_all(
            "SELECT DISTINCT acq_date FROM read_parquet(?) ORDER BY acq_date",
            [cls.dataset_path],
        )
        cls.levels = ("normal", "low", "high", "extreme_low", "extreme_high")
        if cls.sample is None or cls.high is None:
            raise RuntimeError("Anomaly Parquet is missing expected test data")
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

    def test_get_anomalies_returns_200(self) -> None:
        self.assertEqual(self.request("/api/anomalies").status_code, 200)

    def test_default_response_structure_and_pagination(self) -> None:
        body = self.request("/api/anomalies").json()
        self.assertEqual(body["count"], 500)
        self.assertEqual(body["offset"], 0)
        self.assertEqual(body["limit"], 500)
        self.assertTrue(body["has_more"])
        self.assertEqual(len(body["data"]), 500)

    def test_response_matches_pydantic_schema_and_selected_fields(self) -> None:
        response = self.request("/api/anomalies?limit=1")
        parsed = AnomaliesResponse.model_validate(response.json())
        self.assertEqual(parsed.count, 1)
        self.assertEqual(set(parsed.data[0].model_dump().keys()), set(ANOMALY_COLUMNS))

    def test_date_filter(self) -> None:
        response = self.request(f"/api/anomalies?date={self.sample['acq_date']}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["acq_date"] == str(self.sample["acq_date"]) for row in response.json()["data"]))

    def test_start_date_filter(self) -> None:
        response = self.request(f"/api/anomalies?start_date={self.sample['acq_date']}&limit=20")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["acq_date"] >= str(self.sample["acq_date"]) for row in response.json()["data"]))

    def test_end_date_filter(self) -> None:
        response = self.request(f"/api/anomalies?end_date={self.sample['acq_date']}&limit=20")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["acq_date"] <= str(self.sample["acq_date"]) for row in response.json()["data"]))

    def test_reversed_date_range_is_rejected(self) -> None:
        response = self.request("/api/anomalies?start_date=2026-09-10&end_date=2026-09-01")
        self.assertEqual(response.status_code, 422)
        self.assertIn("start_date", response.json()["detail"])

    def test_invalid_date_is_rejected(self) -> None:
        self.assertEqual(self.request("/api/anomalies?date=not-a-date").status_code, 422)

    def test_anomaly_level_filters_for_each_supported_value(self) -> None:
        for level in self.levels:
            with self.subTest(level=level):
                response = self.request(f"/api/anomalies?anomaly_level={level}&limit=50")
                self.assertEqual(response.status_code, 200)
                self.assertTrue(all(row["anomaly_level"] == level for row in response.json()["data"]))

    def test_invalid_anomaly_level_is_rejected(self) -> None:
        self.assertEqual(self.request("/api/anomalies?anomaly_level=unavailable").status_code, 422)

    def test_h3_filter_returns_matching_cell(self) -> None:
        response = self.request(f"/api/anomalies?h3_cell={self.sample['h3_cell']}&limit=5000")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["h3_cell"] == self.sample["h3_cell"] for row in response.json()["data"]))

    def test_malformed_h3_cell_is_rejected(self) -> None:
        self.assertEqual(self.request("/api/anomalies?h3_cell=not-an-h3-cell").status_code, 422)

    def test_wrong_resolution_h3_cell_is_rejected(self) -> None:
        wrong_resolution = h3.latlng_to_cell(0, 0, 6)
        self.assertEqual(self.request(f"/api/anomalies?h3_cell={wrong_resolution}").status_code, 422)

    def test_min_robust_z_filter(self) -> None:
        response = self.request("/api/anomalies?min_robust_z=0.5&limit=100")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["robust_z_score"] >= 0.5 for row in response.json()["data"]))

    def test_max_robust_z_filter(self) -> None:
        response = self.request("/api/anomalies?max_robust_z=1&limit=100")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["robust_z_score"] <= 1 for row in response.json()["data"]))

    def test_invalid_robust_z_range_is_rejected(self) -> None:
        self.assertEqual(self.request("/api/anomalies?min_robust_z=3&max_robust_z=2").status_code, 422)

    def test_min_burn_index_filter(self) -> None:
        response = self.request("/api/anomalies?min_burn_index=80&limit=100")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["burn_index"] >= 80 for row in response.json()["data"]))

    def test_max_burn_index_filter(self) -> None:
        response = self.request("/api/anomalies?max_burn_index=20&limit=100")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["burn_index"] <= 20 for row in response.json()["data"]))

    def test_invalid_burn_index_ranges_are_rejected(self) -> None:
        self.assertEqual(self.request("/api/anomalies?min_burn_index=-1").status_code, 422)
        self.assertEqual(self.request("/api/anomalies?max_burn_index=101").status_code, 422)
        self.assertEqual(self.request("/api/anomalies?min_burn_index=90&max_burn_index=20").status_code, 422)

    def test_pagination_returns_distinct_pages(self) -> None:
        first = self.request("/api/anomalies?limit=3&offset=0").json()
        second = self.request("/api/anomalies?limit=3&offset=3").json()
        self.assertEqual(first["count"], 3)
        self.assertEqual(second["count"], 3)
        self.assertNotEqual(first["data"][0], second["data"][0])
        self.assertEqual(self.request("/api/anomalies?limit=5001").status_code, 422)
        self.assertEqual(self.request("/api/anomalies?offset=-1").status_code, 422)

    def test_total_is_independent_of_page_size(self) -> None:
        first = self.request("/api/anomalies?limit=1").json()
        second = self.request("/api/anomalies?limit=7&offset=7").json()
        self.assertEqual(first["total"], second["total"])
        self.assertEqual(first["total"], 23244)

    def test_list_order_is_deterministic_and_newest_first(self) -> None:
        response = self.request("/api/anomalies?limit=10").json()
        expected = fetch_all(
            "SELECT h3_cell, acq_date, burn_index, daily_median, daily_mad, daily_mean, daily_std, "
            "robust_z_score, anomaly_percentile, anomaly_level FROM read_parquet(?) "
            "ORDER BY acq_date DESC, robust_z_score DESC NULLS LAST, h3_cell ASC LIMIT 10",
            [self.dataset_path],
        )
        self.assertEqual(response["data"], [
            {**row, "acq_date": str(row["acq_date"])} for row in expected
        ])
        self.assertEqual(response["data"], self.request("/api/anomalies?limit=10").json()["data"])

    def test_h3_detail_endpoint_returns_records(self) -> None:
        response = self.request(f"/api/anomalies/{self.sample['h3_cell']}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertGreater(body["total"], 0)
        self.assertTrue(all(row["h3_cell"] == self.sample["h3_cell"] for row in body["data"]))

    def test_h3_detail_records_are_chronological(self) -> None:
        body = self.request(f"/api/anomalies/{self.sample['h3_cell']}?limit=5000").json()
        dates = [row["acq_date"] for row in body["data"]]
        self.assertEqual(dates, sorted(dates))

    def test_h3_detail_supports_date_range_filters(self) -> None:
        date = self.sample["acq_date"]
        body = self.request(
            f"/api/anomalies/{self.sample['h3_cell']}?start_date={date}&end_date={date}"
        ).json()
        self.assertTrue(all(row["acq_date"] == str(date) for row in body["data"]))

    def test_valid_h3_without_observations_returns_empty_history(self) -> None:
        response = self.request(f"/api/anomalies/{self.unobserved_cell}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["data"], [])
        self.assertEqual(response.json()["count"], 0)
        self.assertEqual(response.json()["total"], 0)

    def test_missing_dataset_errors_are_sanitized_for_both_endpoints(self) -> None:
        with patch(
            "app.api.anomaly.get_dataset_path",
            side_effect=DatasetUnavailableError("/secret/path/anomalies.parquet"),
        ):
            list_response = self.request("/api/anomalies")
            detail_response = self.request(f"/api/anomalies/{self.sample['h3_cell']}")
        for response in (list_response, detail_response):
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("/secret/path", response.text)
            self.assertNotIn("anomalies.parquet", response.text)


if __name__ == "__main__":
    unittest.main()
