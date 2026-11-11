"""Durability, overlap and resume tests for automated FIRMS workflows."""

from __future__ import annotations

import tempfile
import threading
import time
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from app.core.config import Settings
from app.services.firms_client import CSVResult, FIRMSClientError, ProductAvailability
from app.services.firms_ingestion import FIRMSIngestionService
from app.services.fire_ingestion import ingest_fire_data


class FakeClient:
    def __init__(self, config: Settings, *, responses: dict[str, str], fail_dates: set[str] | None = None, calls: list[tuple[str, str, str]] | None = None) -> None:
        self.responses = responses
        self.fail_dates = fail_dates or set()
        self.calls = calls if calls is not None else []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def fetch_availability(self):
        return {
            source: ProductAvailability(source, date(2020, 1, 1), date(2020, 1, 10))
            for source in self.responses
        }

    def fetch_area(self, source: str, area: str, start: date, end: date) -> CSVResult:
        self.calls.append((source, start.isoformat(), end.isoformat()))
        if start.isoformat() in self.fail_dates:
            raise FIRMSClientError("mock temporary failure")
        text = self.responses[source]
        return CSVResult(("header",), int(text.count("\n") - 1), text)


def make_settings(**overrides: str) -> Settings:
    env = {
        "APP_ENV": "test",
        "DATA_DIR": "/tmp/terraignis-ingestion-test/processed",
        "FIRMS_MAP_KEY": "test-only",
        "FIRMS_NRT_ENABLED": "true",
        "FIRMS_NRT_SOURCES": "MODIS_NRT",
        "FIRMS_HISTORICAL_ENABLED": "true",
        "FIRMS_HISTORICAL_SOURCES": "MODIS_SP",
        "FIRMS_HISTORICAL_CHUNK_DAYS": "5",
    }
    env.update(overrides)
    return Settings.from_env(env)


class FIRMSIngestionTests(unittest.TestCase):
    def wait_for_job(self, service: FIRMSIngestionService, job_id: str, expected: set[str]) -> dict:
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            job = service.get_historical_status(job_id)
            if job["status"] in expected:
                return job
            time.sleep(0.01)
        self.fail(f"Historical job did not reach {expected}; status={service.get_historical_status(job_id)}")

    def test_nrt_uses_overlapping_window_persists_checkpoint_and_skips_same_raw_response(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            calls: list[tuple[str, str, str]] = []
            csv_text = "latitude,longitude\n27,90\n"
            client_factory = lambda config: FakeClient(config, responses={"MODIS_NRT": csv_text}, calls=calls)
            service = FIRMSIngestionService(
                make_settings(), data_root=Path(temp), client_factory=client_factory,
            )
            first = service.run_nrt_once()
            second = service.run_nrt_once()
            self.assertEqual(first["status"], "succeeded")
            self.assertEqual(first["checkpoints"]["MODIS_NRT"]["date_end"], "2020-01-10")
            self.assertEqual(first["raw_files_added"], 1)
            self.assertTrue(first["pending_generation"])
            self.assertEqual(second["raw_files_added"], 0)
            self.assertTrue(second["pending_generation"])
            self.assertEqual(len(calls), 2)
            self.assertTrue((Path(temp) / "state" / "nrt_status.json").is_file())

    def test_nrt_download_waits_for_user_confirmed_dataset_generation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            service = FIRMSIngestionService(
                make_settings(), data_root=Path(temp),
                client_factory=lambda config: FakeClient(config, responses={"MODIS_NRT": "latitude,longitude\n1,2\n"}),
            )
            downloaded = service.run_nrt_once(manual=True)
            self.assertEqual(downloaded["status"], "succeeded")
            self.assertTrue(downloaded["pending_generation"])
            self.assertTrue(downloaded["download_notice_pending"])
            self.assertTrue(downloaded["manual_run"])
            self.assertIn("MODIS_NRT", downloaded["checkpoints"])

    def test_historical_range_is_chunked_and_job_state_is_persisted(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            calls: list[tuple[str, str, str]] = []
            service = FIRMSIngestionService(
                make_settings(), data_root=Path(temp),
                client_factory=lambda config: FakeClient(config, responses={"MODIS_SP": "header\nrow\n"}, calls=calls),
            )
            initial = service.create_historical_job(date(2020, 1, 1), date(2020, 1, 10), sources=("MODIS_SP",))
            final = self.wait_for_job(service, initial["job_id"], {"succeeded"})
            self.assertEqual(final["total_chunks"], 2)
            self.assertEqual(final["completed_chunks"], 2)
            self.assertEqual(final["progress_percent"], 100)
            self.assertEqual(len(calls), 2)
            self.assertTrue(final["pending_generation"])
            self.assertTrue(final["download_notice_pending"])
            self.assertTrue((Path(temp) / "state" / "historical_jobs.json").is_file())

    def test_resume_skips_successful_chunks_and_retries_only_failed_chunk(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            calls: list[tuple[str, str, str]] = []
            fail_dates = {"2020-01-06"}

            def factory(config):
                return FakeClient(config, responses={"MODIS_SP": "header\nrow\n"}, fail_dates=fail_dates, calls=calls)

            service = FIRMSIngestionService(
                make_settings(), data_root=Path(temp), client_factory=factory,
            )
            initial = service.create_historical_job(date(2020, 1, 1), date(2020, 1, 10), sources=("MODIS_SP",))
            partial = self.wait_for_job(service, initial["job_id"], {"partial_failure"})
            self.assertEqual(partial["completed_chunks"], 1)
            fail_dates.clear()
            service.resume_historical_job(initial["job_id"])
            final = self.wait_for_job(service, initial["job_id"], {"succeeded"})
            self.assertEqual(final["completed_chunks"], 2)
            self.assertEqual(len(calls), 3)
            self.assertTrue(final["pending_generation"])

    def test_single_historical_job_at_a_time_and_cancel_endpoint_state(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            calls: list[tuple[str, str, str]] = []

            fetch_started = threading.Event()
            allow_fetch = threading.Event()

            class SlowClient(FakeClient):
                def fetch_area(self, source: str, area: str, start: date, end: date) -> CSVResult:
                    fetch_started.set()
                    allow_fetch.wait(timeout=2)
                    return CSVResult(("header",), 1, "header\nrow\n")

            service = FIRMSIngestionService(
                make_settings(), data_root=Path(temp),
                client_factory=lambda config: SlowClient(config, responses={"MODIS_SP": "header\nrow\n"}, calls=calls),
            )
            first = service.create_historical_job(date(2020, 1, 1), date(2020, 1, 1), sources=("MODIS_SP",))
            self.assertTrue(fetch_started.wait(timeout=1))
            with self.assertRaises(RuntimeError):
                service.create_historical_job(date(2020, 1, 1), date(2020, 1, 1), sources=("MODIS_SP",))
            allow_fetch.set()
            self.wait_for_job(service, first["job_id"], {"succeeded"})

    def test_cancel_historical_job_stops_at_the_next_chunk_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            fetch_started = threading.Event()
            allow_fetch = threading.Event()

            class SlowClient(FakeClient):
                def fetch_area(self, source: str, area: str, start: date, end: date) -> CSVResult:
                    fetch_started.set()
                    allow_fetch.wait(timeout=2)
                    return CSVResult(("header",), 1, "header\nrow\n")

            service = FIRMSIngestionService(
                make_settings(), data_root=Path(temp),
                client_factory=lambda config: SlowClient(config, responses={"MODIS_SP": "header\nrow\n"}),
            )
            job = service.create_historical_job(date(2020, 1, 1), date(2020, 1, 10), sources=("MODIS_SP",))
            self.assertTrue(fetch_started.wait(timeout=1))
            service.cancel_historical_job(job["job_id"])
            allow_fetch.set()
            cancelled = self.wait_for_job(service, job["job_id"], {"cancelled"})
            self.assertEqual(cancelled["completed_chunks"], 1)
            self.assertEqual(cancelled["pending_chunks"], 1)
            self.assertTrue(cancelled["pending_generation"])
            self.assertTrue(cancelled["download_notice_pending"])

    def test_scheduler_disabled_stays_stopped_and_duplicate_start_creates_one_thread(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            disabled = FIRMSIngestionService(
                make_settings(FIRMS_NRT_ENABLED="false"), data_root=Path(temp)
            )
            disabled.start_scheduler()
            self.assertIsNone(disabled._scheduler_thread)
            self.assertFalse(disabled.get_nrt_status()["enabled"])

        with tempfile.TemporaryDirectory() as temp:
            service = FIRMSIngestionService(make_settings(), data_root=Path(temp))
            started = threading.Event()

            def wait_for_stop():
                started.set()
                service._scheduler_stop.wait(timeout=2)

            with patch.object(service, "_scheduler_loop", side_effect=wait_for_stop):
                service.start_scheduler()
                self.assertTrue(started.wait(timeout=1))
                first_thread = service._scheduler_thread
                service.start_scheduler()
                self.assertIs(service._scheduler_thread, first_thread)
                service.stop_scheduler()

    def test_automated_nrt_and_sp_overlap_deduplicates_with_sp_precedence(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            modis_dir = root / "raw" / "modis" / "automated" / "MODIS_NRT" / "2020"
            sp_dir = root / "raw" / "modis" / "automated" / "MODIS_SP" / "2020"
            modis_dir.mkdir(parents=True)
            sp_dir.mkdir(parents=True)
            header = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight\n"
            observation = "27.1,90.2,320,1,1,2020-01-01,1200,T,80,{version},290,{frp},D\n"
            (modis_dir / "FIRMS__MODIS_NRT__nrt__2020-01-01__2020-01-01__20200102T000000Z__a.txt").write_text(header + observation.format(version="6.1NRT", frp="4.2"), encoding="utf-8")
            (sp_dir / "FIRMS__MODIS_SP__historical__2020-01-01__2020-01-01__20210102T000000Z__b.txt").write_text(header + observation.format(version="6.1", frp="4.1"), encoding="utf-8")

            result = ingest_fire_data(data_root=root)
            import polars as pl

            standardized = pl.read_parquet(result.output_file)
            self.assertEqual(result.total_records, 1)
            self.assertEqual(standardized["version"][0], "6.1")
            self.assertIn("MODIS_SP", standardized["source_file"][0])


if __name__ == "__main__":
    unittest.main()
