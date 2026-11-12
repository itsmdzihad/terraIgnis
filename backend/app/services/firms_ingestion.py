"""Durable shared ingestion state and NRT/historical FIRMS workflows."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

from app.core.config import BACKEND_ROOT, Settings, settings
from app.services.firms_client import (
    FIRMSClient,
    FIRMSClientError,
    FIRMSConfigurationError,
    ProductAvailability,
    split_date_range,
)

logger = logging.getLogger(__name__)
DATA_ROOT = BACKEND_ROOT / "data"
STATE_ROOT = DATA_ROOT / "state"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


@contextmanager
def _file_lock(path: Path, *, blocking: bool = True) -> Iterator[bool]:
    """Cross-process advisory lock. The OS releases it if the process exits."""
    path.parent.mkdir(parents=True, exist_ok=True)
    handle = path.open("a+b")
    acquired = False
    try:
        try:
            import fcntl

            flags = fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB)
            try:
                fcntl.flock(handle.fileno(), flags)
                acquired = True
            except BlockingIOError:
                acquired = False
        except ImportError:  # pragma: no cover - Windows fallback
            import msvcrt

            try:
                msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK if blocking else msvcrt.LK_NBLCK, 1)
                acquired = True
            except OSError:
                acquired = False
        yield acquired
    finally:
        if acquired:
            try:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            except ImportError:  # pragma: no cover - Windows fallback
                import msvcrt

                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        handle.close()


class FIRMSIngestionService:
    """Own NASA data polling, persistent checkpoints, and resumable backfill jobs."""

    def __init__(
        self,
        config: Settings = settings,
        *,
        data_root: Path | None = None,
        client_factory=FIRMSClient,
        dataset_generator=None,
    ) -> None:
        self.config = config
        self.data_root = Path(data_root) if data_root is not None else DATA_ROOT
        self.state_root = self.data_root / "state"
        self.raw_root = self.data_root / "raw"
        self.client_factory = client_factory
        self.dataset_generator = dataset_generator
        self.nrt_state_path = self.state_root / "nrt_status.json"
        self.history_path = self.state_root / "historical_jobs.json"
        self.nrt_lock_path = self.state_root / "nrt_run.lock"
        self.history_lock_path = self.state_root / "historical_run.lock"
        self._thread_lock = threading.RLock()
        self._nrt_status: dict[str, Any] = _read_json(self.nrt_state_path, self._empty_nrt_status())
        self._history_threads: dict[str, threading.Thread] = {}
        self._scheduler_stop = threading.Event()
        self._scheduler_thread: threading.Thread | None = None
        self._manual_nrt_thread: threading.Thread | None = None

    @staticmethod
    def _empty_nrt_status() -> dict[str, Any]:
        return {
            "enabled": False,
            "status": "idle",
            "last_started_at": None,
            "last_finished_at": None,
            "next_run_at": None,
            "last_success_at": None,
            "sources": {},
            "last_error": None,
            "pending_generation": False,
            "download_notice_pending": False,
            "manual_run": False,
            "run_id": None,
            "downloaded_records": 0,
            "raw_files_added": 0,
        }

    def _save_json(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
            os.replace(temp_path, path)
        finally:
            temp_path.unlink(missing_ok=True)

    def _save_nrt(self) -> None:
        with _file_lock(self.nrt_state_path.with_suffix(".lock")):
            self._save_json(self.nrt_state_path, self._nrt_status)

    def _availability(self, client: FIRMSClient, sources: tuple[str, ...]) -> dict[str, ProductAvailability]:
        available = client.fetch_availability()
        return {source: available[source] for source in sources if source in available}

    def _store_raw(self, source: str, mode: str, start: date, end: date, text: str) -> tuple[Path, bool, str]:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        sensor = "modis" if source.startswith("MODIS") else "viirs"
        retrieved = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        folder = self.raw_root / sensor / "automated" / source / start.strftime("%Y")
        existing = next(
            folder.glob(f"FIRMS__{source}__{mode}__{start.isoformat()}__{end.isoformat()}__*__{digest[:16]}.txt"),
            None,
        ) if folder.is_dir() else None
        if existing is not None:
            return existing, False, digest
        path = folder / f"FIRMS__{source}__{mode}__{start.isoformat()}__{end.isoformat()}__{retrieved}__{digest[:16]}.txt"
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.is_file():
            return path, False, digest
        temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            with temporary.open("x", encoding="utf-8", newline="") as output:
                output.write(text)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
        return path, True, digest

    def _generate_datasets(self, *, timeout_seconds: float = 6 * 60 * 60) -> dict[str, Any]:
        """Invoke the established pipeline endpoint and wait for its background run."""
        if self.dataset_generator is not None:
            return self.dataset_generator()
        from fastapi import HTTPException

        from app.api.pipeline import generate_datasets, pipeline_status

        try:
            queued = generate_datasets()
        except HTTPException as exc:
            raise RuntimeError(str(exc.detail)) from exc
        job_id = str(queued["job_id"])
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            status = pipeline_status()
            if status.get("job_id") == job_id and status.get("status") in {"succeeded", "failed"}:
                if status.get("status") != "succeeded":
                    raise RuntimeError(str(status.get("message") or "Dataset generation failed."))
                return status
            time.sleep(0.25)
        raise TimeoutError("Dataset generation did not finish before the wait limit.")

    def _nrt_cycle(self, *, manual: bool = False) -> dict[str, Any]:
        if not self.config.firms_map_key:
            raise FIRMSConfigurationError("NASA FIRMS ingestion is not configured. Set FIRMS_MAP_KEY in backend/.env.")
        run_id = uuid.uuid4().hex
        started = utc_now()
        with self._thread_lock:
            self._nrt_status.update({
                "enabled": self.config.firms_nrt_enabled,
                "status": "running",
                "run_id": run_id,
                "manual_run": manual,
                "last_started_at": started,
                "last_error": None,
                "sources": self._nrt_status.get("sources", {}),
            })
            self._save_nrt()

        source_results: dict[str, Any] = {}
        new_files = 0
        now_date = datetime.now(timezone.utc).date()
        logger.info(
            "FIRMS NRT run started run_id=%s area=%s lookback_days=%d sources=%s",
            run_id,
            self.config.firms_geographic_scope,
            self.config.firms_nrt_lookback_days,
            ",".join(self.config.firms_nrt_sources),
        )
        with self.client_factory(self.config) as client:
            availability = self._availability(client, self.config.firms_nrt_sources)
            for source in self.config.firms_nrt_sources:
                product = availability.get(source)
                if product is None:
                    source_results[source] = {"status": "unavailable", "error": "Product is not listed by NASA."}
                    continue
                end = min(product.max_date, now_date)
                start = max(product.min_date, end - timedelta(days=self.config.firms_nrt_lookback_days - 1))
                if start > end:
                    source_results[source] = {"status": "unavailable", "error": "No recent dates are reported for this product."}
                    continue
                try:
                    result = client.fetch_area(source, self.config.firms_geographic_scope, start, end)
                    _, created, digest = self._store_raw(source, "nrt", start, end, result.text)
                    new_files += int(created)
                    logger.info(
                        "FIRMS NRT source complete run_id=%s source=%s dates=%s..%s records=%d new_raw_response=%s",
                        run_id,
                        source,
                        start.isoformat(),
                        end.isoformat(),
                        result.row_count,
                        created,
                    )
                    source_results[source] = {
                        "status": "succeeded",
                        "date_start": start.isoformat(),
                        "date_end": end.isoformat(),
                        "downloaded_records": result.row_count,
                        "raw_file_saved": created,
                        "raw_sha256": digest,
                    }
                except FIRMSClientError as exc:
                    logger.warning("FIRMS NRT source failed run_id=%s source=%s: %s", run_id, source, exc)
                    source_results[source] = {"status": "failed", "error": str(exc)}

        pending_generation = bool(new_files or self._nrt_status.get("pending_generation"))
        successful_sources = [name for name, result in source_results.items() if result.get("status") == "succeeded"]
        finished = utc_now()
        with self._thread_lock:
            checkpoints = dict(self._nrt_status.get("checkpoints") or {})
            for source in successful_sources:
                result = source_results[source]
                checkpoints[source] = {
                    "date_start": result["date_start"],
                    "date_end": result["date_end"],
                    "last_success_at": finished,
                }
            errors = [result["error"] for result in source_results.values() if result.get("error")]
            self._nrt_status.update({
                "status": "failed" if errors and not successful_sources else "succeeded",
                "last_finished_at": finished,
                "last_success_at": finished if successful_sources else self._nrt_status.get("last_success_at"),
                "sources": source_results,
                "checkpoints": checkpoints,
                "last_error": "; ".join(errors) if errors else None,
                "pending_generation": pending_generation,
                "download_notice_pending": bool(manual or new_files),
                "last_generation_job_id": self._nrt_status.get("last_generation_job_id"),
                "downloaded_records": sum(int(value.get("downloaded_records", 0)) for value in source_results.values()),
                "raw_files_added": new_files,
            })
            self._save_nrt()
            logger.info(
                "FIRMS NRT run finished run_id=%s status=%s records=%d raw_files_added=%d generation_pending=%s",
                run_id,
                self._nrt_status["status"],
                self._nrt_status["downloaded_records"],
                new_files,
                pending_generation,
            )
            return dict(self._nrt_status)

    def run_nrt_once(self, *, manual: bool = False) -> dict[str, Any]:
        """Run a single poll cycle while preventing overlap across processes."""
        with _file_lock(self.nrt_lock_path, blocking=False) as acquired:
            if not acquired:
                raise RuntimeError("An NRT ingestion run is already active.")
            try:
                return self._nrt_cycle(manual=manual)
            except Exception as exc:
                with self._thread_lock:
                    self._nrt_status.update({"status": "failed", "last_finished_at": utc_now(), "last_error": str(exc)})
                    self._save_nrt()
                raise

    def start_nrt_manual(self) -> dict[str, Any]:
        """Queue an on-demand NRT run without blocking the request handler."""
        with self._thread_lock:
            if self._manual_nrt_thread and self._manual_nrt_thread.is_alive():
                raise RuntimeError("An NRT ingestion run is already active.")

            def worker() -> None:
                try:
                    self.run_nrt_once(manual=True)
                except Exception as exc:
                    logger.warning("On-demand FIRMS NRT run failed: %s", exc)

            self._manual_nrt_thread = threading.Thread(target=worker, daemon=True, name="firms-nrt-manual")
            self._manual_nrt_thread.start()
            return {"status": "queued", "message": "NRT ingestion started."}

    def start_scheduler(self) -> None:
        """Start the configured scheduler once for this app process."""
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            return
        if not self.config.firms_nrt_enabled:
            self._nrt_status["enabled"] = False
            self._save_nrt()
            return
        if not self.config.firms_map_key:
            self._nrt_status.update({
                "enabled": True,
                "status": "configuration_error",
                "last_error": "FIRMS_MAP_KEY is missing; automated polling is paused.",
            })
            self._save_nrt()
            logger.error("FIRMS NRT scheduler enabled but FIRMS_MAP_KEY is not configured")
            return
        self._scheduler_stop.clear()
        self._nrt_status["enabled"] = True
        self._save_nrt()
        self._scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True, name="firms-nrt-scheduler")
        self._scheduler_thread.start()

    def stop_scheduler(self) -> None:
        self._scheduler_stop.set()
        thread = self._scheduler_thread
        if thread and thread.is_alive():
            thread.join(timeout=5)

    def _scheduler_loop(self) -> None:
        with _file_lock(self.state_root / "nrt_scheduler_leader.lock", blocking=False) as leader:
            if not leader:
                logger.info("FIRMS NRT scheduler is active in another application worker")
                return
            interval = self.config.firms_nrt_interval_minutes * 60
            while not self._scheduler_stop.is_set():
                try:
                    self.run_nrt_once()
                except Exception as exc:
                    logger.warning("FIRMS NRT cycle failed; scheduler will continue: %s", exc)
                next_run = datetime.now(timezone.utc) + timedelta(seconds=interval)
                self._nrt_status["next_run_at"] = next_run.isoformat()
                self._save_nrt()
                self._scheduler_stop.wait(interval)

    def get_nrt_status(self) -> dict[str, Any]:
        persisted = _read_json(self.nrt_state_path, self._empty_nrt_status())
        persisted["enabled"] = self.config.firms_nrt_enabled
        persisted["configured"] = bool(self.config.firms_map_key)
        persisted["interval_minutes"] = self.config.firms_nrt_interval_minutes
        persisted["sources_configured"] = list(self.config.firms_nrt_sources)
        persisted.pop("map_key", None)
        return persisted

    def create_historical_job(
        self,
        start_date: date,
        end_date: date,
        area: str | None = None,
        sources: tuple[str, ...] | None = None,
    ) -> dict[str, Any]:
        """Validate product availability and create a durable, resumable job."""
        if not self.config.firms_map_key:
            raise FIRMSConfigurationError("NASA FIRMS ingestion is not configured. Set FIRMS_MAP_KEY in backend/.env.")
        if not self.config.firms_historical_enabled:
            raise FIRMSConfigurationError("Historical ingestion is disabled. Set FIRMS_HISTORICAL_ENABLED=true to enable it.")
        if start_date > end_date:
            raise ValueError("Start date must be on or before end date.")
        selected_sources = sources or self.config.firms_historical_sources
        if any(source not in self.config.firms_historical_sources for source in selected_sources):
            raise ValueError("Only configured Standard Processing products can be used for historical backfills.")
        selected_area = self.config.firms_geographic_scope if area is None else area
        from app.services.firms_client import validate_area

        selected_area = validate_area(selected_area)
        logger.info(
            "FIRMS historical planning area=%s dates=%s..%s sources=%s",
            selected_area,
            start_date.isoformat(),
            end_date.isoformat(),
            ",".join(selected_sources),
        )
        with self.client_factory(self.config) as client:
            availability = self._availability(client, selected_sources)
        chunks: list[dict[str, Any]] = []
        for source in selected_sources:
            product = availability.get(source)
            if product is None:
                continue
            available_start = max(start_date, product.min_date)
            available_end = min(end_date, product.max_date)
            if available_start > available_end:
                continue
            for chunk_start, chunk_end in split_date_range(
                available_start, available_end, self.config.firms_historical_chunk_days
            ):
                chunks.append({
                    "source": source,
                    "start_date": chunk_start.isoformat(),
                    "end_date": chunk_end.isoformat(),
                    "status": "pending",
                    "records": 0,
                    "raw_file": None,
                    "raw_file_added": False,
                    "error": None,
                })
        if not chunks:
            raise ValueError("No selected FIRMS products report data in the requested date range.")
        job_id = uuid.uuid4().hex
        job = {
            "job_id": job_id,
            "status": "queued",
            "stage": "downloading",
            "area": selected_area,
            "requested_start_date": start_date.isoformat(),
            "requested_end_date": end_date.isoformat(),
            "sources": list(selected_sources),
            "chunks": chunks,
            "total_chunks": len(chunks),
            "completed_chunks": 0,
            "failed_chunks": 0,
            "downloaded_records": 0,
            "raw_files_added": 0,
            "started_at": utc_now(),
            "updated_at": utc_now(),
            "finished_at": None,
            "last_error": None,
            "cancel_requested": False,
            "pending_generation": False,
            "download_notice_pending": False,
            "generation_job_id": None,
        }
        with _file_lock(self.history_path.with_suffix(".lock")):
            jobs = _read_json(self.history_path, {})
            if any(item.get("status") in {"queued", "running", "processing"} for item in jobs.values()):
                raise RuntimeError("A historical FIRMS job is already active.")
            jobs[job_id] = job
            self._save_json(self.history_path, jobs)
        self._start_history_worker(job_id)
        return self._public_history_job(job)

    def _start_history_worker(self, job_id: str) -> None:
        with self._thread_lock:
            current = self._history_threads.get(job_id)
            if current and current.is_alive():
                return
            thread = threading.Thread(target=self._run_history_job, args=(job_id,), daemon=True, name=f"firms-history-{job_id[:8]}")
            self._history_threads[job_id] = thread
            thread.start()

    def _get_history_job(self, job_id: str) -> dict[str, Any] | None:
        jobs = _read_json(self.history_path, {})
        job = jobs.get(job_id)
        return job if isinstance(job, dict) else None

    def _update_history_job(self, job_id: str, update: dict[str, Any]) -> dict[str, Any] | None:
        with _file_lock(self.history_path.with_suffix(".lock")):
            jobs = _read_json(self.history_path, {})
            job = jobs.get(job_id)
            if not isinstance(job, dict):
                return None
            job.update(update)
            job["updated_at"] = utc_now()
            self._save_json(self.history_path, jobs)
            return job

    def _run_history_job(self, job_id: str) -> None:
        with _file_lock(self.history_lock_path, blocking=False) as acquired:
            if not acquired:
                self._update_history_job(job_id, {"status": "queued", "stage": "waiting_for_worker"})
                return
            job = self._get_history_job(job_id)
            if not job:
                return
            if job.get("status") == "cancelled" or job.get("cancel_requested"):
                has_downloads = int(job.get("raw_files_added", 0)) > 0
                self._update_history_job(job_id, {
                    "status": "cancelled", "stage": None, "finished_at": utc_now(),
                    "pending_generation": has_downloads, "download_notice_pending": True,
                })
                return
            self._update_history_job(job_id, {"status": "running", "stage": "downloading", "last_error": None})
            failed = False
            for index, chunk in enumerate(job["chunks"]):
                job = self._get_history_job(job_id) or job
                if job.get("cancel_requested"):
                    has_downloads = int(job.get("raw_files_added", 0)) > 0
                    self._update_history_job(job_id, {
                        "status": "cancelled", "stage": None, "finished_at": utc_now(),
                        "pending_generation": has_downloads, "download_notice_pending": True,
                    })
                    return
                if chunk["status"] == "completed":
                    continue
                source = str(chunk["source"])
                start = date.fromisoformat(chunk["start_date"])
                end = date.fromisoformat(chunk["end_date"])
                self._update_history_job(job_id, {"current_chunk": index + 1})
                try:
                    with self.client_factory(self.config) as client:
                        result = client.fetch_area(source, job["area"], start, end)
                    path, created, digest = self._store_raw(source, "historical", start, end, result.text)
                    chunk.update({"status": "completed", "records": result.row_count, "raw_file": str(path.relative_to(self.data_root)), "raw_file_added": created, "sha256": digest, "error": None})
                    logger.info(
                        "FIRMS historical chunk complete job_id=%s source=%s area=%s dates=%s..%s records=%d",
                        job_id,
                        source,
                        job["area"],
                        start.isoformat(),
                        end.isoformat(),
                        result.row_count,
                    )
                except FIRMSClientError as exc:
                    failed = True
                    chunk.update({"status": "failed", "error": str(exc)})
                    logger.warning("FIRMS historical chunk failed job_id=%s source=%s dates=%s..%s: %s", job_id, source, start, end, exc)
                job["chunks"][index] = chunk
                completed = sum(item["status"] == "completed" for item in job["chunks"])
                failed_count = sum(item["status"] == "failed" for item in job["chunks"])
                records = sum(int(item.get("records", 0)) for item in job["chunks"])
                raw_files_added = sum(bool(item.get("raw_file_added")) for item in job["chunks"])
                self._update_history_job(job_id, {
                    "chunks": job["chunks"],
                    "completed_chunks": completed,
                    "failed_chunks": failed_count,
                    "downloaded_records": records,
                    "raw_files_added": raw_files_added,
                })

            job = self._get_history_job(job_id) or job
            if any(chunk["status"] != "completed" for chunk in job["chunks"]):
                status = "partial_failure" if failed else "cancelled"
                has_downloads = int(job.get("raw_files_added", 0)) > 0
                self._update_history_job(job_id, {
                    "status": status,
                    "stage": None,
                    "finished_at": utc_now(),
                    "last_error": "One or more chunks failed." if failed else None,
                    "pending_generation": has_downloads,
                    "download_notice_pending": True,
                })
                return

            if job.get("cancel_requested"):
                has_downloads = int(job.get("raw_files_added", 0)) > 0
                self._update_history_job(job_id, {
                    "status": "cancelled", "stage": None, "finished_at": utc_now(),
                    "pending_generation": has_downloads, "download_notice_pending": True,
                })
                return

            has_downloads = int(job.get("raw_files_added", 0)) > 0
            self._update_history_job(job_id, {
                "status": "succeeded",
                "stage": None,
                "finished_at": utc_now(),
                "last_error": None,
                "pending_generation": has_downloads,
                "download_notice_pending": True,
            })

    @staticmethod
    def _public_history_job(job: dict[str, Any]) -> dict[str, Any]:
        public = dict(job)
        chunks = public.get("chunks", [])
        public["pending_chunks"] = sum(chunk["status"] == "pending" for chunk in chunks)
        public["failed_chunks"] = sum(chunk["status"] == "failed" for chunk in chunks)
        public["completed_chunks"] = sum(chunk["status"] == "completed" for chunk in chunks)
        public["raw_files_added"] = sum(bool(chunk.get("raw_file_added")) for chunk in chunks)
        public["progress_percent"] = round(public["completed_chunks"] * 100 / max(1, len(chunks)), 2)
        public.pop("cancel_requested", None)
        return public

    def get_historical_status(self, job_id: str | None = None) -> dict[str, Any]:
        jobs = _read_json(self.history_path, {})
        if job_id:
            job = jobs.get(job_id)
            if not isinstance(job, dict):
                raise KeyError("Historical FIRMS job was not found.")
            return self._public_history_job(job)
        ordered = sorted(jobs.values(), key=lambda item: item.get("started_at") or "", reverse=True)
        resumable_cancelled = lambda job: (
            job.get("status") == "cancelled"
            and (
                any(chunk.get("status") != "completed" for chunk in job.get("chunks", []))
                or not job.get("generation_job_id")
            )
        )
        return {
            "enabled": self.config.firms_historical_enabled,
            "configured": bool(self.config.firms_map_key),
            "active_job": next((
                self._public_history_job(job)
                for job in ordered
                if job.get("status") in {"queued", "running", "processing", "processing_failed", "partial_failure"}
                or job.get("download_notice_pending")
                or resumable_cancelled(job)
            ), None),
            "jobs": [self._public_history_job(job) for job in ordered[:20]],
        }

    def resume_historical_job(self, job_id: str) -> dict[str, Any]:
        job = self._get_history_job(job_id)
        if not job:
            raise KeyError("Historical FIRMS job was not found.")
        if job.get("status") in {"queued", "running", "processing"}:
            raise RuntimeError("This historical FIRMS job is already active.")
        chunks = job.get("chunks", [])
        for chunk in chunks:
            if chunk.get("status") == "failed":
                chunk.update({"status": "pending", "error": None})
        if not any(chunk.get("status") != "completed" for chunk in chunks):
            if job.get("status") not in {"processing_failed", "partial_failure", "cancelled"}:
                raise RuntimeError("This historical FIRMS job has no pending chunks to resume.")
        self._update_history_job(job_id, {
            "chunks": chunks,
            "status": "queued",
            "stage": "downloading",
            "finished_at": None,
            "cancel_requested": False,
            "last_error": None,
            "pending_generation": False,
            "download_notice_pending": False,
        })
        self._start_history_worker(job_id)
        return self.get_historical_status(job_id)

    def cancel_historical_job(self, job_id: str) -> dict[str, Any]:
        job = self._get_history_job(job_id)
        if not job:
            raise KeyError("Historical FIRMS job was not found.")
        if job.get("status") == "processing":
            raise RuntimeError("Dataset generation is already running and cannot be cancelled.")
        if job.get("status") not in {"queued", "running"}:
            raise RuntimeError("Only an active historical FIRMS job can be cancelled.")
        update = {"cancel_requested": True}
        if job.get("status") == "queued":
            has_downloads = int(job.get("raw_files_added", 0)) > 0
            update.update({
                "status": "cancelled",
                "stage": None,
                "finished_at": utc_now(),
                "pending_generation": has_downloads,
                "download_notice_pending": True,
            })
        self._update_history_job(job_id, update)
        return self.get_historical_status(job_id)

    def recover_interrupted_jobs(self) -> None:
        """Resume durable work left active when the previous server process stopped."""
        jobs = _read_json(self.history_path, {})
        for job_id, job in jobs.items():
            if job.get("status") in {"queued", "running", "processing"}:
                self._update_history_job(job_id, {"status": "queued", "stage": "downloading", "last_error": None})
                self._start_history_worker(job_id)

    def get_status(self) -> dict[str, Any]:
        return {
            "nrt": self.get_nrt_status(),
            "historical": self.get_historical_status(),
        }

    def mark_generation_published(self, generation_job_id: str) -> None:
        """Clear ingestion prompts after a full processed generation is published."""
        with self._thread_lock:
            persisted_nrt = _read_json(self.nrt_state_path, self._empty_nrt_status())
            persisted_nrt.update({
                "pending_generation": False,
                "download_notice_pending": False,
                "last_generation_job_id": generation_job_id,
            })
            self._nrt_status = persisted_nrt
            self._save_nrt()

        with _file_lock(self.history_path.with_suffix(".lock")):
            jobs = _read_json(self.history_path, {})
            changed = False
            for job in jobs.values():
                if not isinstance(job, dict) or not job.get("download_notice_pending"):
                    continue
                job.update({
                    "pending_generation": False,
                    "download_notice_pending": False,
                    "generation_job_id": generation_job_id,
                    "updated_at": utc_now(),
                })
                changed = True
            if changed:
                self._save_json(self.history_path, jobs)

    def reset_data_state(self) -> None:
        """Forget persisted ingestion history after the data store is cleared."""
        with self._thread_lock:
            self._nrt_status = self._empty_nrt_status()
            self._nrt_status["enabled"] = self.config.firms_nrt_enabled
            self._save_nrt()

        with _file_lock(self.history_path.with_suffix(".lock")):
            self._save_json(self.history_path, {})


firms_ingestion = FIRMSIngestionService()
