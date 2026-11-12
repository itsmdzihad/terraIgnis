"""API compatibility and authorization tests for FIRMS ingestion controls."""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.main import app


class IngestionApiTests(unittest.TestCase):
    def request(self, method: str, path: str, **kwargs):
        async def send():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(send())

    def test_status_is_public_but_does_not_expose_credential_fields(self) -> None:
        response = self.request("GET", "/api/ingestion/status")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("nrt", body)
        self.assertIn("historical", body)
        self.assertNotIn("map_key", body["nrt"])
        self.assertNotIn("test-only", response.text)

    def test_new_management_routes_are_registered_without_changing_existing_routes(self) -> None:
        paths = set(app.openapi()["paths"])
        for path in (
            "/api/ingestion/status",
            "/api/ingestion/nrt/status",
            "/api/ingestion/nrt/run",
            "/api/ingestion/historical/status",
            "/api/ingestion/historical/start",
            "/api/ingestion/historical/{job_id}/resume",
            "/api/ingestion/historical/{job_id}/cancel",
        ):
            self.assertIn(path, paths)
        for path in ("/api/fires", "/api/calendar", "/api/anomalies", "/api/stats", "/api/pipeline/status"):
            self.assertIn(path, paths)

    def test_operator_endpoint_requires_bearer_token_when_configured(self) -> None:
        test_config = Settings.from_env({"APP_ENV": "test", "FIRMS_INGESTION_TOKEN": "operator-test-token"})
        with patch("app.api.ingestion.settings", test_config), patch(
            "app.api.ingestion.firms_ingestion.start_nrt_manual", return_value={"status": "queued"}
        ):
            unauthorized = self.request("POST", "/api/ingestion/nrt/run")
            authorized = self.request(
                "POST", "/api/ingestion/nrt/run",
                headers={"Authorization": "Bearer operator-test-token"},
            )
        self.assertEqual(unauthorized.status_code, 401)
        self.assertEqual(authorized.status_code, 202)
        self.assertNotIn("operator-test-token", authorized.text)

    def test_production_allows_ingestion_when_optional_token_is_unset(self) -> None:
        production = Settings.from_env({"APP_ENV": "production", "FIRMS_INGESTION_TOKEN": ""})
        with patch("app.api.ingestion.settings", production), patch(
            "app.api.ingestion.firms_ingestion.start_nrt_manual", return_value={"status": "queued"}
        ):
            response = self.request("POST", "/api/ingestion/nrt/run")
        self.assertEqual(response.status_code, 202)

    def test_historical_request_rejects_reversed_date_range(self) -> None:
        response = self.request(
            "POST", "/api/ingestion/historical/start",
            json={"start_date": "2020-01-02", "end_date": "2020-01-01"},
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
