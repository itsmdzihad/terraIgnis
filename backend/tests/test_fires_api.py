"""Integration tests for the filtered spatial fires API."""

import asyncio
import unittest
from unittest.mock import patch

import h3
from httpx import ASGITransport, AsyncClient

from app.api.fires import FIRE_COLUMNS
from app.core.database import DatasetUnavailableError, fetch_one, get_dataset_path
from app.main import app
from app.schemas.fire import FiresResponse


class FiresApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.sample = fetch_one(
            "SELECT h3_cell, acq_date, burn_index, sensor_presence "
            "FROM read_parquet(?) ORDER BY acq_date, h3_cell LIMIT 1",
            [get_dataset_path("anomalies")],
        )
        if cls.sample is None:
            raise RuntimeError("Anomaly Parquet contains no test data")

    def request(self, path: str):
        async def send():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                return await client.get(path)

        return asyncio.run(send())

    def test_default_request_has_paginated_response_structure(self) -> None:
        response = self.request("/api/fires")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["count"], 500)
        self.assertEqual(body["offset"], 0)
        self.assertGreater(body["total"], body["count"])
        self.assertTrue(body["has_more"])
        self.assertEqual(len(body["data"]), 500)
        self.assertEqual(body["filters"]["limit"], 500)

    def test_date_filter(self) -> None:
        response = self.request(f"/api/fires?date={self.sample['acq_date']}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["acq_date"] == str(self.sample["acq_date"]) for row in response.json()["data"]))

    def test_start_date_filter(self) -> None:
        response = self.request(f"/api/fires?start_date={self.sample['acq_date']}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["acq_date"] >= str(self.sample["acq_date"]) for row in response.json()["data"]))

    def test_end_date_filter(self) -> None:
        response = self.request(f"/api/fires?end_date={self.sample['acq_date']}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(all(row["acq_date"] <= str(self.sample["acq_date"]) for row in response.json()["data"]))

    def test_invalid_date_and_start_after_end_are_rejected(self) -> None:
        self.assertEqual(self.request("/api/fires?date=not-a-date").status_code, 422)
        response = self.request("/api/fires?start_date=2026-09-10&end_date=2026-09-01")
        self.assertEqual(response.status_code, 422)
        self.assertIn("start_date", response.json()["detail"])

    def test_h3_filter_and_invalid_cell(self) -> None:
        response = self.request(f"/api/fires?h3_cell={self.sample['h3_cell']}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total"], 1)
        self.assertEqual(response.json()["data"][0]["h3_cell"], self.sample["h3_cell"])
        self.assertEqual(self.request("/api/fires?h3_cell=not-an-h3-cell").status_code, 422)
        valid_wrong_resolution = h3.latlng_to_cell(0, 0, 6)
        self.assertEqual(self.request(f"/api/fires?h3_cell={valid_wrong_resolution}").status_code, 422)

    def test_min_and_max_burn_index_filters(self) -> None:
        minimum = float(self.sample["burn_index"])
        min_response = self.request(f"/api/fires?min_burn_index={minimum}")
        max_response = self.request(f"/api/fires?max_burn_index={minimum}")
        self.assertTrue(all(row["burn_index"] >= minimum for row in min_response.json()["data"]))
        self.assertTrue(all(row["burn_index"] <= minimum for row in max_response.json()["data"]))

    def test_invalid_burn_index_ranges_are_rejected(self) -> None:
        self.assertEqual(self.request("/api/fires?min_burn_index=-1").status_code, 422)
        self.assertEqual(self.request("/api/fires?max_burn_index=101").status_code, 422)
        self.assertEqual(self.request("/api/fires?min_burn_index=90&max_burn_index=20").status_code, 422)

    def test_sensor_filters_match_actual_presence_values(self) -> None:
        for sensor, accepted in (
            ("MODIS", {"MODIS", "MODIS+VIIRS"}),
            ("VIIRS", {"VIIRS", "MODIS+VIIRS"}),
            ("BOTH", {"MODIS+VIIRS"}),
        ):
            response = self.request(f"/api/fires?sensor={sensor}")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(all(row["sensor_presence"] in accepted for row in response.json()["data"]))
        self.assertEqual(self.request("/api/fires?sensor=UNKNOWN").status_code, 422)

    def test_limit_and_offset(self) -> None:
        first = self.request("/api/fires?limit=3&offset=0").json()
        second = self.request("/api/fires?limit=3&offset=3").json()
        self.assertEqual(first["count"], 3)
        self.assertEqual(second["count"], 3)
        self.assertEqual(first["total"], second["total"])
        self.assertNotEqual(first["data"][0]["h3_cell"], second["data"][0]["h3_cell"])
        self.assertEqual(self.request("/api/fires?limit=5001").status_code, 422)
        self.assertEqual(self.request("/api/fires?offset=-1").status_code, 422)

    def test_response_matches_pydantic_schema_and_selects_expected_fields(self) -> None:
        response = self.request("/api/fires?limit=1")
        parsed = FiresResponse.model_validate(response.json())
        self.assertEqual(parsed.count, 1)
        self.assertEqual(set(parsed.data[0].model_dump().keys()), set(FIRE_COLUMNS))

    def test_missing_dataset_error_is_sanitized(self) -> None:
        with patch("app.api.fires.get_dataset_path", side_effect=DatasetUnavailableError("/secret/path/anomalies.parquet")):
            response = self.request("/api/fires")
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("/secret/path", response.text)
        self.assertNotIn("anomalies.parquet", response.text)


if __name__ == "__main__":
    unittest.main()
