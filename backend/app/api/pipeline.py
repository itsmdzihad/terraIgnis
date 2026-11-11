"""Local FIRMS file intake and background dataset-generation workflow."""

from __future__ import annotations

import csv
import ctypes
import errno
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, Header, HTTPException, Request, status
from starlette.datastructures import UploadFile

from app.services.fire_ingestion import MODIS_REQUIRED, VIIRS_REQUIRED
from app.services.processing_lock import analytical_processing_lock

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pipeline", tags=["data pipeline"])

BACKEND_ROOT = Path(__file__).resolve().parents[2]
RAW_ROOT = BACKEND_ROOT / "data" / "raw"
UPLOAD_STAGING = BACKEND_ROOT / "data" / ".incoming"
MAX_FILE_BYTES = 512 * 1024 * 1024
MAX_BATCH_BYTES = 1024 * 1024 * 1024

PIPELINE_STAGES = (
    ("Ingest and standardize FIRMS files", "scripts/ingest.py"),
    ("Profile standardized observations", "scripts/profile_fires.py"),
    ("Aggregate observations to H3 cells", "scripts/build_h3_grid.py"),
    ("Harmonize MODIS and VIIRS", "scripts/build_harmonized_fire.py"),
    ("Calculate Burn Index", "scripts/build_burn_index.py"),
    ("Detect anomalies", "scripts/build_anomalies.py"),
)

PIPELINE_OUTPUTS = (
    BACKEND_ROOT / "data" / "processed" / "standardized_fires.parquet",
    BACKEND_ROOT / "data" / "reports" / "fire_profile.json",
    BACKEND_ROOT / "data" / "processed" / "h3_fire_daily.parquet",
    BACKEND_ROOT / "data" / "processed" / "harmonized_fire.parquet",
    BACKEND_ROOT / "data" / "processed" / "burn_index.parquet",
    BACKEND_ROOT / "data" / "processed" / "anomalies.parquet",
)

DATA_ROOT = BACKEND_ROOT / "data"
GENERATIONS_ROOT = DATA_ROOT / ".generations"
LAST_GENERATION_PATH = DATA_ROOT / "state" / "last_dataset_generation.json"


def _load_last_generation() -> dict[str, str | None]:
    try:
        payload = json.loads(LAST_GENERATION_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"last_successful_at": None, "last_successful_job_id": None}
    if not isinstance(payload, dict):
        return {"last_successful_at": None, "last_successful_job_id": None}
    return {
        "last_successful_at": payload.get("last_successful_at"),
        "last_successful_job_id": payload.get("last_successful_job_id"),
    }


def _save_last_generation(finished_at: str, job_id: str) -> None:
    LAST_GENERATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = LAST_GENERATION_PATH.with_name(f".{LAST_GENERATION_PATH.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(json.dumps({
            "last_successful_at": finished_at,
            "last_successful_job_id": job_id,
        }), encoding="utf-8")
        os.replace(temporary, LAST_GENERATION_PATH)
    finally:
        temporary.unlink(missing_ok=True)

_LOCK = threading.Lock()
_ACTIVE_UPLOADS = 0
_JOB: dict[str, object] = {
    "job_id": None,
    "status": "idle",
    "stage": None,
    "message": "Upload FIRMS MODIS or VIIRS text files to begin.",
    "stages": [],
    "logs": [],
    "started_at": None,
    "finished_at": None,
    **_load_last_generation(),
}


def _raw_file_counts() -> dict[str, int]:
    modis = sum(1 for path in (RAW_ROOT / "modis").rglob("*") if path.is_file() and path.suffix.lower() in {".txt", ".csv"})
    viirs = sum(1 for path in (RAW_ROOT / "viirs").rglob("*") if path.is_file() and path.suffix.lower() in {".txt", ".csv"})
    return {"MODIS": modis, "VIIRS": viirs, "total": modis + viirs}


def _detect_sensor(path: Path) -> str:
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            header = next(csv.reader(source), [])
    except (OSError, UnicodeDecodeError, csv.Error) as exc:
        raise HTTPException(status_code=422, detail="The file is not a readable FIRMS CSV/TXT file.") from exc

    columns = {column.strip() for column in header}
    if MODIS_REQUIRED.issubset(columns):
        return "MODIS"
    if VIIRS_REQUIRED.issubset(columns):
        return "VIIRS"
    raise HTTPException(
        status_code=422,
        detail="Unrecognized FIRMS file. Expected a MODIS or VIIRS active-fire text/CSV header.",
    )


def _safe_file_stem(filename: str) -> str:
    portable_name = filename.replace("\\", "/").split("/")[-1]
    stem = Path(portable_name).stem
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-")
    return (cleaned or "firms-data")[:160]


def _is_pipeline_running() -> bool:
    return _JOB["status"] in {"queued", "running"}


def _append_log(message: str) -> None:
    with _LOCK:
        logs = _JOB["logs"]
        assert isinstance(logs, list)
        logs.extend(message.splitlines() or [message])
        _JOB["logs"] = logs[-200:]


def _set_stage_status(index: int, stage_status: str) -> None:
    with _LOCK:
        stages = _JOB["stages"]
        assert isinstance(stages, list)
        stages[index]["status"] = stage_status


def _prepare_generation_root(generation_root: Path) -> None:
    """Prepare isolated output folders and link existing raw inputs read-only."""
    (generation_root / "processed").mkdir(parents=True, exist_ok=True)
    (generation_root / "reports").mkdir(parents=True, exist_ok=True)
    for sensor in ("modis", "viirs"):
        source_root = RAW_ROOT / sensor
        if not source_root.exists():
            continue
        for source in source_root.rglob("*"):
            if not source.is_file():
                continue
            destination = generation_root / "raw" / sensor / source.relative_to(source_root)
            destination.parent.mkdir(parents=True, exist_ok=True)
            try:
                destination.symlink_to(source.resolve())
            except OSError:
                shutil.copy2(source, destination)


def _rename_exchange(left: Path, right: Path) -> bool:
    """Atomically exchange two paths on Linux; return false when unavailable."""
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        renameat2 = libc.renameat2
    except (AttributeError, OSError):
        return False
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    result = renameat2(-100, os.fsencode(left), -100, os.fsencode(right), 2)  # AT_FDCWD, RENAME_EXCHANGE
    if result == 0:
        return True
    error = ctypes.get_errno()
    if error in {errno.ENOSYS, errno.EINVAL, errno.EXDEV, errno.ENOTSUP}:
        return False
    raise OSError(error, os.strerror(error), f"{left} <-> {right}")


def _publish_generation(generation_root: Path, job_id: str) -> None:
    """Atomically switch all processed Parquet files through one directory link."""
    processed_path = DATA_ROOT / "processed"
    new_processed = generation_root / "processed"
    link_path = DATA_ROOT / f".processed-{job_id}.link"
    relative_target = os.path.relpath(new_processed, DATA_ROOT)
    link_path.symlink_to(relative_target, target_is_directory=True)
    legacy_path = GENERATIONS_ROOT / f"legacy-{job_id}" / "processed"
    legacy_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        if not processed_path.exists() and not processed_path.is_symlink():
            os.replace(link_path, processed_path)
            return
        if processed_path.is_symlink():
            os.replace(link_path, processed_path)
            return
        if _rename_exchange(link_path, processed_path):
            try:
                os.replace(link_path, legacy_path)
            except OSError:
                logger.warning("Published generation %s but could not archive the prior processed directory", job_id)
            return

        # Portable fallback: retain the old generation and restore it if the
        # second rename fails. POSIX/Linux takes the atomic exchange above.
        os.replace(processed_path, legacy_path)
        try:
            os.replace(link_path, processed_path)
        except Exception:
            os.replace(legacy_path, processed_path)
            raise
    finally:
        if link_path.is_symlink() or link_path.is_file():
            link_path.unlink(missing_ok=True)


def _validate_staged_outputs(generation_root: Path) -> None:
    """Require every output and preserve the currently published Parquet schema."""
    import polars as pl

    for output in PIPELINE_OUTPUTS:
        staged = generation_root / output.relative_to(DATA_ROOT)
        if not staged.is_file() or staged.stat().st_size == 0:
            raise RuntimeError(f"Pipeline did not produce a non-empty {output.relative_to(BACKEND_ROOT)}.")
        if staged.suffix == ".parquet" and (output.is_file() or output.is_symlink()):
            old_schema = pl.read_parquet_schema(output)
            new_schema = pl.read_parquet_schema(staged)
            if old_schema != new_schema:
                raise RuntimeError(f"Staged dataset schema changed unexpectedly for {output.name}.")


def _publish_profile_report(generation_root: Path) -> None:
    staged = generation_root / "reports" / "fire_profile.json"
    destination = DATA_ROOT / "reports" / "fire_profile.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    try:
        shutil.copy2(staged, temporary)
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _run_pipeline(job_id: str) -> None:
    with analytical_processing_lock():
        _run_pipeline_locked(job_id)


def _run_pipeline_locked(job_id: str) -> None:
    started_at = datetime.now(timezone.utc).isoformat()
    GENERATIONS_ROOT.mkdir(parents=True, exist_ok=True)
    generation_root = GENERATIONS_ROOT / job_id
    shutil.rmtree(generation_root, ignore_errors=True)
    _prepare_generation_root(generation_root)
    published = False
    with _LOCK:
        _JOB.update({"status": "running", "started_at": started_at, "message": "Generating processed datasets."})

    try:
        for index, (stage_name, script_path) in enumerate(PIPELINE_STAGES):
            with _LOCK:
                _JOB["stage"] = stage_name
            _set_stage_status(index, "running")
            _append_log(f"Starting: {stage_name}")
            child_env = os.environ.copy()
            child_env["TERRAIGNIS_DATA_ROOT"] = str(generation_root)
            result = subprocess.run(
                [sys.executable, script_path],
                cwd=BACKEND_ROOT,
                capture_output=True,
                text=True,
                check=False,
                timeout=6 * 60 * 60,
                env=child_env,
            )
            if result.stdout.strip():
                _append_log(result.stdout[-12000:])
            if result.stderr.strip():
                _append_log(result.stderr[-12000:])
            if result.returncode != 0:
                _set_stage_status(index, "failed")
                raise RuntimeError(f"{stage_name} failed with exit code {result.returncode}.")
            expected_output = generation_root / PIPELINE_OUTPUTS[index].relative_to(DATA_ROOT)
            if not expected_output.is_file():
                _set_stage_status(index, "failed")
                raise RuntimeError(
                    f"{stage_name} exited successfully but did not create "
                    f"{PIPELINE_OUTPUTS[index].relative_to(BACKEND_ROOT)}."
                )
            _set_stage_status(index, "succeeded")
            _append_log(f"Completed: {stage_name}")

        _validate_staged_outputs(generation_root)
        _publish_generation(generation_root, job_id)
        published = True
        try:
            _publish_profile_report(generation_root)
        except OSError:
            logger.exception("Published datasets but could not update the supplementary profile report")
            _append_log("Datasets were published; the supplementary profile report could not be updated.")
        with _LOCK:
            finished_at = datetime.now(timezone.utc).isoformat()
            _JOB.update({
                "status": "succeeded",
                "stage": None,
                "message": "All processed datasets were generated successfully.",
                "finished_at": finished_at,
                "last_successful_at": finished_at,
                "last_successful_job_id": job_id,
            })
        try:
            _save_last_generation(finished_at, job_id)
            from app.services.firms_ingestion import firms_ingestion

            firms_ingestion.mark_generation_published(job_id)
        except Exception:
            logger.exception("Datasets were published, but ingestion completion state could not be updated")
            _append_log("Datasets were published; ingestion completion state could not be updated.")
    except Exception as exc:
        logger.exception("TerraIgnis data pipeline failed (job_id=%s)", job_id)
        if published:
            _append_log("The new processed generation was published; a follow-up report write failed.")
        else:
            _append_log("The previous processed generation remains active; the staged output was not published.")

        with _LOCK:
            stages = _JOB["stages"]
            if isinstance(stages, list):
                for stage in stages:
                    if stage["status"] == "running":
                        stage["status"] = "failed"
            _JOB.update({
                "status": "failed",
                "message": str(exc),
                "finished_at": datetime.now(timezone.utc).isoformat(),
            })
        _append_log(f"Pipeline failed: {exc}")
    finally:
        if not published:
            shutil.rmtree(generation_root, ignore_errors=True)


@router.post("/uploads", status_code=status.HTTP_201_CREATED)
async def upload_raw_file(
    request: Request,
    x_filename: str = Header(..., alias="X-Filename"),
) -> dict[str, object]:
    """Validate and store one raw FIRMS file; repeat this request for multiple files."""
    global _ACTIVE_UPLOADS
    filename = unquote(x_filename).strip()
    suffix = Path(filename.replace("\\", "/").split("/")[-1]).suffix.lower()
    if not filename or suffix not in {".txt", ".csv"}:
        raise HTTPException(status_code=422, detail="Choose a NASA FIRMS .txt or .csv file.")

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="Each raw file must be 512 MB or smaller.")

    with _LOCK:
        if _is_pipeline_running():
            raise HTTPException(status_code=409, detail="Wait for the current pipeline run to finish before uploading.")
        _ACTIVE_UPLOADS += 1

    UPLOAD_STAGING.mkdir(parents=True, exist_ok=True)
    temporary_path = UPLOAD_STAGING / f"{uuid.uuid4().hex}.upload"
    digest = hashlib.sha256()
    size = 0
    try:
        with temporary_path.open("wb") as destination:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="Each raw file must be 512 MB or smaller.")
                digest.update(chunk)
                destination.write(chunk)
        if size == 0:
            raise HTTPException(status_code=422, detail="The selected file is empty.")

        sensor = _detect_sensor(temporary_path)
        file_hash = digest.hexdigest()
        target_dir = RAW_ROOT / sensor.lower()
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{_safe_file_stem(filename)}-{file_hash[:12]}.txt"
        duplicate = target.is_file()
        if duplicate:
            temporary_path.unlink(missing_ok=True)
        else:
            temporary_path.replace(target)

        return {
            "filename": Path(filename.replace("\\", "/").split("/")[-1]).name,
            "stored_filename": target.name,
            "sensor": sensor,
            "bytes": size,
            "duplicate": duplicate,
            "raw_files": _raw_file_counts(),
        }
    finally:
        temporary_path.unlink(missing_ok=True)
        with _LOCK:
            _ACTIVE_UPLOADS -= 1


@router.post("/uploads/batch", status_code=status.HTTP_201_CREATED)
async def upload_raw_files(request: Request) -> dict[str, object]:
    """Validate and save multiple FIRMS files in one request for one sensor."""
    global _ACTIVE_UPLOADS
    with _LOCK:
        if _is_pipeline_running():
            raise HTTPException(status_code=409, detail="Wait for the current pipeline run to finish before uploading.")
        _ACTIVE_UPLOADS += 1

    temporary_paths: list[Path] = []
    promoted_paths: list[Path] = []
    uploads: list[UploadFile] = []
    form = None
    try:
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > MAX_BATCH_BYTES + 1024 * 1024:
            raise HTTPException(status_code=413, detail="The total batch must be 1 GB or smaller.")

        UPLOAD_STAGING.mkdir(parents=True, exist_ok=True)
        try:
            form = await request.form()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Send files as multipart form data.") from exc

        selected_sensor = str(form.get("sensor", "")).strip().upper()
        if selected_sensor not in {"MODIS", "VIIRS"}:
            raise HTTPException(status_code=422, detail="Choose MODIS or VIIRS as the data source.")

        form_files = form.getlist("files")
        if not form_files or any(not isinstance(item, UploadFile) for item in form_files):
            raise HTTPException(status_code=422, detail="Select one or more FIRMS .txt or .csv files.")
        uploads = form_files

        prepared: list[dict[str, object]] = []
        batch_size = 0
        for upload in uploads:
            filename = (upload.filename or "").strip()
            basename = filename.replace("\\", "/").split("/")[-1]
            if not basename or Path(basename).suffix.lower() not in {".txt", ".csv"}:
                raise HTTPException(status_code=422, detail=f"{filename or 'A selected file'} is not a .txt or .csv file.")

            temporary_path = UPLOAD_STAGING / f"{uuid.uuid4().hex}.upload"
            temporary_paths.append(temporary_path)
            digest = hashlib.sha256()
            size = 0
            with temporary_path.open("wb") as destination:
                while chunk := await upload.read(1024 * 1024):
                    size += len(chunk)
                    batch_size += len(chunk)
                    if size > MAX_FILE_BYTES:
                        raise HTTPException(status_code=413, detail=f"{basename} exceeds the 512 MB per-file limit.")
                    if batch_size > MAX_BATCH_BYTES:
                        raise HTTPException(status_code=413, detail="The total batch must be 1 GB or smaller.")
                    digest.update(chunk)
                    destination.write(chunk)
            if size == 0:
                raise HTTPException(status_code=422, detail=f"{basename} is empty.")

            detected_sensor = _detect_sensor(temporary_path)
            if detected_sensor != selected_sensor:
                raise HTTPException(
                    status_code=422,
                    detail=f"{basename} contains {detected_sensor} data, but {selected_sensor} was selected. No files were saved.",
                )

            file_hash = digest.hexdigest()
            target = RAW_ROOT / selected_sensor.lower() / f"{_safe_file_stem(basename)}-{file_hash[:12]}.txt"
            prepared.append({
                "filename": basename,
                "stored_filename": target.name,
                "sensor": selected_sensor,
                "bytes": size,
                "duplicate": False,
                "temporary_path": temporary_path,
                "target": target,
            })

        with _LOCK:
            if _is_pipeline_running():
                raise HTTPException(status_code=409, detail="A data-generation job started while the files were uploading.")
            for item in prepared:
                target = item["target"]
                temporary_path = item["temporary_path"]
                assert isinstance(target, Path) and isinstance(temporary_path, Path)
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.is_file():
                    item["duplicate"] = True
                else:
                    temporary_path.replace(target)
                    promoted_paths.append(target)

        result_files = [
            {key: value for key, value in item.items() if key not in {"temporary_path", "target"}}
            for item in prepared
        ]
        return {
            "sensor": selected_sensor,
            "total_files": len(result_files),
            "uploaded_files": sum(not item["duplicate"] for item in result_files),
            "duplicate_files": sum(item["duplicate"] for item in result_files),
            "files": result_files,
            "raw_files": _raw_file_counts(),
        }
    except Exception:
        if promoted_paths:
            with _LOCK:
                for path in promoted_paths:
                    path.unlink(missing_ok=True)
        raise
    finally:
        for path in temporary_paths:
            path.unlink(missing_ok=True)
        if form is not None:
            await form.close()
        with _LOCK:
            _ACTIVE_UPLOADS -= 1


@router.get("/status")
def pipeline_status() -> dict[str, object]:
    """Return the current generation job and uploaded raw-file inventory."""
    with _LOCK:
        snapshot = deepcopy(_JOB)
    snapshot["raw_files"] = _raw_file_counts()
    return snapshot


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED)
def generate_datasets() -> dict[str, object]:
    """Start the README pipeline commands in order as a single background job."""
    with _LOCK:
        if _is_pipeline_running():
            raise HTTPException(status_code=409, detail="A data-generation job is already running.")
        if _ACTIVE_UPLOADS:
            raise HTTPException(status_code=409, detail="Wait for current uploads to finish before generating.")
        if _raw_file_counts()["total"] == 0:
            raise HTTPException(status_code=409, detail="Upload at least one valid FIRMS raw file first.")

        job_id = uuid.uuid4().hex
        _JOB.update({
            "job_id": job_id,
            "status": "queued",
            "stage": None,
            "message": "Pipeline queued.",
            "stages": [{"name": name, "status": "pending"} for name, _ in PIPELINE_STAGES],
            "logs": [],
            "started_at": None,
            "finished_at": None,
        })

    worker = threading.Thread(target=_run_pipeline, args=(job_id,), daemon=True, name=f"pipeline-{job_id[:8]}")
    worker.start()
    return {"job_id": job_id, "status": "queued", "message": "Dataset generation started."}
