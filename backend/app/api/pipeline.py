"""Local FIRMS file intake and background dataset-generation workflow."""

from __future__ import annotations

import csv
import hashlib
import logging
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.services.fire_ingestion import MODIS_REQUIRED, VIIRS_REQUIRED

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/pipeline", tags=["data pipeline"])

BACKEND_ROOT = Path(__file__).resolve().parents[2]
RAW_ROOT = BACKEND_ROOT / "data" / "raw"
UPLOAD_STAGING = BACKEND_ROOT / "data" / ".incoming"
MAX_FILE_BYTES = 512 * 1024 * 1024

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

PROCESSED_OUTPUTS = (
    BACKEND_ROOT / "data" / "processed" / "standardized_fires.parquet",
    BACKEND_ROOT / "data" / "processed" / "h3_fire_daily.parquet",
    BACKEND_ROOT / "data" / "processed" / "harmonized_fire.parquet",
    BACKEND_ROOT / "data" / "processed" / "burn_index.parquet",
    BACKEND_ROOT / "data" / "processed" / "anomalies.parquet",
    BACKEND_ROOT / "data" / "reports" / "fire_profile.json",
)

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
}


def _raw_file_counts() -> dict[str, int]:
    modis = sum(1 for path in (RAW_ROOT / "modis").glob("*.txt") if path.is_file())
    viirs = sum(1 for path in (RAW_ROOT / "viirs").glob("*.txt") if path.is_file())
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


def _restore_outputs(backup_root: Path) -> None:
    for output in PROCESSED_OUTPUTS:
        backup = backup_root / output.relative_to(BACKEND_ROOT)
        if backup.is_file():
            output.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup, output)
        elif output.exists():
            output.unlink()


def _run_pipeline(job_id: str) -> None:
    started_at = datetime.now(timezone.utc).isoformat()
    backup_root = Path(tempfile.mkdtemp(prefix="terraignis-pipeline-backup-"))
    with _LOCK:
        _JOB.update({"status": "running", "started_at": started_at, "message": "Generating processed datasets."})

    try:
        for output in PROCESSED_OUTPUTS:
            if output.is_file():
                backup = backup_root / output.relative_to(BACKEND_ROOT)
                backup.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(output, backup)

        for index, (stage_name, script_path) in enumerate(PIPELINE_STAGES):
            with _LOCK:
                _JOB["stage"] = stage_name
            _set_stage_status(index, "running")
            _append_log(f"Starting: {stage_name}")
            result = subprocess.run(
                [sys.executable, script_path],
                cwd=BACKEND_ROOT,
                capture_output=True,
                text=True,
                check=False,
                timeout=6 * 60 * 60,
            )
            if result.stdout.strip():
                _append_log(result.stdout[-12000:])
            if result.stderr.strip():
                _append_log(result.stderr[-12000:])
            if result.returncode != 0:
                _set_stage_status(index, "failed")
                raise RuntimeError(f"{stage_name} failed with exit code {result.returncode}.")
            expected_output = PIPELINE_OUTPUTS[index]
            if not expected_output.is_file():
                _set_stage_status(index, "failed")
                raise RuntimeError(
                    f"{stage_name} exited successfully but did not create "
                    f"{expected_output.relative_to(BACKEND_ROOT)}."
                )
            _set_stage_status(index, "succeeded")
            _append_log(f"Completed: {stage_name}")

        with _LOCK:
            _JOB.update({
                "status": "succeeded",
                "stage": None,
                "message": "All processed datasets were generated successfully.",
                "finished_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as exc:
        logger.exception("TerraIgnis data pipeline failed (job_id=%s)", job_id)
        try:
            if backup_root.exists():
                _restore_outputs(backup_root)
                _append_log("Restored the last complete processed dataset after the failure.")
        except Exception:
            logger.exception("Could not restore processed outputs after pipeline failure")
            _append_log("Warning: automatic restore of previous processed outputs also failed.")

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
        shutil.rmtree(backup_root, ignore_errors=True)


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
