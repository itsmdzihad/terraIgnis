"""Integration tests for the daily fire activity calendar API."""

import asyncio
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient

from app.core.database import DatasetUnavailableError, fetch_all, fetch_one, get_dataset_path
from app.main import app
from app.schemas.calendar import CalendarResponse


class CalendarApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dataset_path = get_dataset_path("anomalies")
        cls.sample = fetch_one(
            "SELECT acq_date FROM read_parquet(?) ORDER BY acq_date LIMIT 1",
            [cls.dataset_path],
        )
        cls.high_anomaly_day = fetch_one(
            "SELECT acq_date FROM read_parquet(?) WHERE anomaly_level = 'high' "
            "GROUP BY acq_date ORDER BY acq_date LIMIT 1",
            [cls.dataset_path],
        )
        cls.dates = fetch_all(
            "SELECT DISTINCT acq_date FROM read_parquet(?) ORDER BY acq_date",
            [cls.dataset_path],
        )
        if cls.sample is None or cls.high_anomaly_day is None:
            raise RuntimeError("Anomaly Parquet is missing expected test data")

    def request(self, path: str):
        async def send():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                return await client.get(path)

        return asyncio.run(send())

    def test_default_response_is_typed_paginated_and_date_ordered(self) -> None:
        response = self.request("/api/calendar")
        self.assertEqual(response.status_code, 200)
        parsed = CalendarResponse.model_validate(response.json())
        self.assertEqual(parsed.limit, 100)
        self.assertEqual(parsed.offset, 0)
        self.assertEqual(parsed.count, min(100, parsed.total))
        self.assertEqual([row.date for row in parsed.data], sorted(row.date for row in parsed.data))
        self.assertTrue(all(row.fire_count >= 0 and row.anomaly_count >= 0 for row in parsed.data))

    def test_calendar_contains_only_dates_observed_in_source(self) -> None:
        response = self.request("/api/calendar?limit=366")
        self.assertEqual(response.status_code, 200)
        returned = [row["date"] for row in response.json()["data"]]
        source_dates = [str(row["acq_date"]) for row in self.dates]
        self.assertEqual(returned, source_dates)

    def test_date_filter_returns_one_day_or_an_empty_result(self) -> None:
        target = self.sample["acq_date"]
        response = self.request(f"/api/calendar?date={target}")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["data"][0]["date"], str(target))
        absent = target + timedelta(days=1)
        if absent not in [row["acq_date"] for row in self.dates]:
            empty = self.request(f"/api/calendar?date={absent}").json()
            self.assertEqual(empty["data"], [])
            self.assertEqual(empty["total"], 0)

    def test_start_date_end_date_and_combined_range_filters(self) -> None:
        dates = [row["acq_date"] for row in self.dates]
        middle = dates[len(dates) // 2]
        start = self.request(f"/api/calendar?start_date={middle}").json()
        end = self.request(f"/api/calendar?end_date={middle}").json()
        ranged = self.request(f"/api/calendar?start_date={dates[2]}&end_date={dates[5]}").json()
        self.assertTrue(all(row["date"] >= str(middle) for row in start["data"]))
        self.assertTrue(all(row["date"] <= str(middle) for row in end["data"]))
        self.assertEqual([row["date"] for row in ranged["data"]], [str(day) for day in dates[2:6]])

    def test_invalid_dates_and_reversed_ranges_return_422(self) -> None:
        self.assertEqual(self.request("/api/calendar?date=not-a-date").status_code, 422)
        self.assertEqual(self.request("/api/calendar?start_date=2026-09-10&end_date=2026-09-01").status_code, 422)

    def test_anomaly_level_is_validated_against_supported_values(self) -> None:
        for level in ("normal", "low", "high", "extreme_low", "extreme_high"):
            with self.subTest(level=level):
                self.assertEqual(self.request(f"/api/calendar?anomaly_level={level}&limit=1").status_code, 200)
        self.assertEqual(self.request("/api/calendar?anomaly_level=unavailable").status_code, 422)

    def test_default_anomaly_count_counts_non_normal_records(self) -> None:
        target = self.high_anomaly_day["acq_date"]
        row = self.request(f"/api/calendar?date={target}").json()["data"][0]
        expected = fetch_one(
            "SELECT count(*) FILTER (WHERE anomaly_level <> 'normal') AS n "
            "FROM read_parquet(?) WHERE acq_date = ?",
            [self.dataset_path, target],
        )["n"]
        self.assertEqual(row["anomaly_count"], expected)

    def test_requested_anomaly_level_changes_count_not_daily_fire_metrics(self) -> None:
        target = self.high_anomaly_day["acq_date"]
        baseline = self.request(f"/api/calendar?date={target}").json()["data"][0]
        filtered = self.request(f"/api/calendar?date={target}&anomaly_level=high").json()["data"][0]
        expected = fetch_one(
            "SELECT count(*) FILTER (WHERE anomaly_level = 'high') AS n "
            "FROM read_parquet(?) WHERE acq_date = ?",
            [self.dataset_path, target],
        )["n"]
        self.assertEqual(filtered["anomaly_count"], expected)
        for field in ("fire_count", "mean_burn_index", "max_burn_index"):
            self.assertEqual(filtered[field], baseline[field])

    def test_aggregates_match_duckdb_source_rows(self) -> None:
        target = self.high_anomaly_day["acq_date"]
        row = self.request(f"/api/calendar?date={target}").json()["data"][0]
        expected = fetch_one(
            "SELECT count(*) AS fire_count, avg(burn_index) AS mean_burn_index, "
            "max(burn_index) AS max_burn_index FROM read_parquet(?) WHERE acq_date = ?",
            [self.dataset_path, target],
        )
        self.assertEqual(row["fire_count"], expected["fire_count"])
        self.assertAlmostEqual(row["mean_burn_index"], expected["mean_burn_index"])
        self.assertEqual(row["max_burn_index"], expected["max_burn_index"])

    def test_limit_offset_and_pagination_metadata(self) -> None:
        first = self.request("/api/calendar?limit=3&offset=0").json()
        second = self.request("/api/calendar?limit=3&offset=3").json()
        self.assertEqual(first["count"], 3)
        self.assertEqual(second["count"], 3)
        self.assertEqual(first["total"], second["total"])
        self.assertNotEqual(first["data"][0]["date"], second["data"][0]["date"])
        self.assertEqual(first["has_more"], first["total"] > 3)
        self.assertEqual(self.request("/api/calendar?limit=0").status_code, 422)
        self.assertEqual(self.request("/api/calendar?limit=367").status_code, 422)
        self.assertEqual(self.request("/api/calendar?offset=-1").status_code, 422)

    def test_missing_dataset_error_is_sanitized(self) -> None:
        with patch(
            "app.api.calendar.get_dataset_path",
            side_effect=DatasetUnavailableError("/secret/path/anomalies.parquet"),
        ):
            response = self.request("/api/calendar")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("/secret/path", response.text)
        self.assertNotIn("anomalies.parquet", response.text)


if __name__ == "__main__":
    unittest.main()
