"""Mocked contract and resilience tests for NASA FIRMS API calls."""

from __future__ import annotations

import unittest
from datetime import date

import httpx

from app.core.config import Settings
from app.services.firms_client import (
    FIRMSClient,
    FIRMSClientError,
    FIRMSConfigurationError,
    parse_firms_csv,
    split_date_range,
    validate_area,
    validate_date_range,
)

MODIS_CSV = (
    "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,"
    "version,bright_t31,frp,daynight\n"
    "27.1,90.2,320,1,1,2026-01-01,1200,T,80,6.1NRT,290,4.2,D\n"
)
AVAILABILITY_CSV = "data_id,min_date,max_date\nMODIS_SP,2000-01-01,2026-01-31\n"


def test_settings(**overrides: str) -> Settings:
    values = {
        "APP_ENV": "test",
        "DATA_DIR": "/tmp/terraignis-firms-test/processed",
        "FIRMS_MAP_KEY": "not-a-real-key",
        "FIRMS_MAX_RETRIES": "1",
        "FIRMS_RETRY_BACKOFF_SECONDS": "0",
    }
    values.update(overrides)
    return Settings.from_env(values)


class FIRMSClientTests(unittest.TestCase):
    def test_area_api_url_includes_source_area_days_and_inclusive_start_date(self) -> None:
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(200, text=MODIS_CSV)

        client = FIRMSClient(test_settings(), http_client=httpx.Client(transport=httpx.MockTransport(handler)))
        result = client.fetch_area("MODIS_NRT", "54,5.5,102,40", date(2026, 1, 1), date(2026, 1, 3))
        self.assertEqual(result.row_count, 1)
        self.assertEqual(requests[0].url.path, "/api/area/csv/not-a-real-key/MODIS_NRT/54,5.5,102,40/3/2026-01-01")

    def test_recent_api_url_omits_date_parameter(self) -> None:
        requests: list[httpx.Request] = []
        http_client = httpx.Client(transport=httpx.MockTransport(lambda request: (requests.append(request) or httpx.Response(200, text=MODIS_CSV))))
        FIRMSClient(test_settings(), http_client=http_client).fetch_recent_area("MODIS_NRT", "world", 3)
        self.assertEqual(requests[0].url.path, "/api/area/csv/not-a-real-key/MODIS_NRT/world/3")

    def test_area_api_rejects_more_than_five_days(self) -> None:
        with self.assertRaises(ValueError):
            validate_date_range(date(2026, 1, 1), date(2026, 1, 6))

    def test_split_date_range_is_contiguous_inclusive_and_non_overlapping(self) -> None:
        self.assertEqual(
            split_date_range(date(2026, 1, 1), date(2026, 1, 12), 5),
            [(date(2026, 1, 1), date(2026, 1, 5)), (date(2026, 1, 6), date(2026, 1, 10)), (date(2026, 1, 11), date(2026, 1, 12))],
        )

    def test_area_validation_accepts_global_and_bounding_box(self) -> None:
        self.assertEqual(validate_area("WORLD"), "world")
        self.assertEqual(validate_area("54,5.5,102,40"), "54,5.5,102,40")
        with self.assertRaises(ValueError):
            validate_area("180,0,-180,90")

    def test_data_availability_parses_per_product_date_ranges(self) -> None:
        http_client = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, text=AVAILABILITY_CSV)))
        availability = FIRMSClient(test_settings(), http_client=http_client).fetch_availability()
        self.assertEqual(availability["MODIS_SP"].min_date, date(2000, 1, 1))
        self.assertEqual(availability["MODIS_SP"].max_date, date(2026, 1, 31))

    def test_missing_key_fails_without_sending_request(self) -> None:
        requests: list[httpx.Request] = []
        client = FIRMSClient(test_settings(FIRMS_MAP_KEY=""), http_client=httpx.Client(transport=httpx.MockTransport(lambda request: (requests.append(request) or httpx.Response(200, text=MODIS_CSV)))))
        with self.assertRaises(FIRMSConfigurationError):
            client.fetch_area("MODIS_NRT", "world", date(2026, 1, 1), date(2026, 1, 1))
        self.assertEqual(requests, [])

    def test_empty_valid_csv_is_not_an_error(self) -> None:
        parsed = parse_firms_csv(MODIS_CSV.splitlines()[0] + "\n", {"latitude", "acq_date"})
        self.assertEqual(parsed.row_count, 0)

    def test_html_and_missing_columns_are_rejected(self) -> None:
        with self.assertRaises(FIRMSClientError):
            parse_firms_csv("<html>Service unavailable</html>", {"latitude"})
        with self.assertRaises(FIRMSClientError):
            parse_firms_csv("latitude,longitude\n1,2\n", {"latitude", "acq_date"})

    def test_partial_csv_rows_are_rejected(self) -> None:
        with self.assertRaises(FIRMSClientError):
            parse_firms_csv("a,b\n1\n", {"a", "b"})

    def test_429_retry_after_is_respected_and_request_retried(self) -> None:
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            if len(requests) == 1:
                return httpx.Response(429, headers={"Retry-After": "0"})
            return httpx.Response(200, text=MODIS_CSV)

        delays: list[float] = []
        client = FIRMSClient(test_settings(), http_client=httpx.Client(transport=httpx.MockTransport(handler)), sleep=delays.append)
        self.assertEqual(client.fetch_area("MODIS_NRT", "world", date(2026, 1, 1), date(2026, 1, 1)).row_count, 1)
        self.assertEqual(len(requests), 2)
        self.assertEqual(delays, [0.0])

    def test_http_500_retry_exhaustion_returns_sanitized_error(self) -> None:
        client = FIRMSClient(
            test_settings(),
            http_client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(500, text="private error"))),
            sleep=lambda _: None,
        )
        with self.assertRaisesRegex(FIRMSClientError, "HTTP 500") as raised:
            client.fetch_area("MODIS_NRT", "world", date(2026, 1, 1), date(2026, 1, 1))
        self.assertNotIn("private error", str(raised.exception))

    def test_timeout_retries_then_returns_safe_error(self) -> None:
        client = FIRMSClient(
            test_settings(),
            http_client=httpx.Client(transport=httpx.MockTransport(lambda _: (_ for _ in ()).throw(httpx.ReadTimeout("secret url")))),
            sleep=lambda _: None,
        )
        with self.assertRaisesRegex(FIRMSClientError, "timed out"):
            client.fetch_area("MODIS_NRT", "world", date(2026, 1, 1), date(2026, 1, 1))


if __name__ == "__main__":
    unittest.main()
