"""Tests for FastAPI settings and read-only DuckDB foundations."""

import asyncio
import unittest
from pathlib import Path

from httpx import ASGITransport, AsyncClient

from app.core.config import BACKEND_ROOT, DATASET_FILENAMES, Settings, settings
from app.core.database import (
    QueryExecutionError,
    fetch_all,
    fetch_one,
    fetch_scalar,
    get_dataset_path,
)
from app.main import app


class ApiFoundationTests(unittest.TestCase):
    def test_application_starts_and_health_returns_ok(self) -> None:
        async def request_health():
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                return await client.get("/health")

        response = asyncio.run(request_health())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_relative_data_dir_resolves_from_backend_root(self) -> None:
        config = Settings.from_env({"APP_ENV": "test", "DATA_DIR": "data/processed"})
        self.assertEqual(config.app_env, "test")
        self.assertEqual(config.data_dir, (BACKEND_ROOT / "data/processed").resolve())
        self.assertTrue(config.data_dir.is_dir())

    def test_absolute_data_dir_is_preserved(self) -> None:
        target = Path("/tmp/terraignis-test-data")
        config = Settings.from_env({"DATA_DIR": str(target)})
        self.assertEqual(config.data_dir, target)

    def test_all_processed_dataset_paths_are_centralized(self) -> None:
        for name, filename in DATASET_FILENAMES.items():
            self.assertEqual(settings.dataset_path(name), settings.data_dir / filename)
        self.assertEqual(len(DATASET_FILENAMES), 5)

    def test_duckdb_reads_existing_parquet_dataset(self) -> None:
        path = get_dataset_path("burn_index")
        row_count = fetch_scalar("SELECT count(*) FROM read_parquet(?)", [path])
        self.assertGreater(row_count, 0)

    def test_query_helpers_support_parameters_and_python_structures(self) -> None:
        self.assertEqual(fetch_one("SELECT ?::INTEGER AS answer", (42,)), {"answer": 42})
        self.assertEqual(fetch_all("SELECT ?::VARCHAR AS label", ["terra"]), [{"label": "terra"}])
        self.assertIsNone(fetch_one("SELECT 1 WHERE 1 = 0"))
        self.assertEqual(fetch_scalar("SELECT ?::INTEGER + ?::INTEGER", [2, 3]), 5)

    def test_data_access_rejects_mutating_sql(self) -> None:
        with self.assertRaises(QueryExecutionError):
            fetch_all("DELETE FROM anything")


if __name__ == "__main__":
    unittest.main()
