"""Management API for NASA FIRMS NRT polling and historical backfills."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, HTTPException, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.schemas.ingestion import IngestionStatusResponse, NRTIngestionStatus, HistoricalIngestionStartRequest
from app.services.firms_client import FIRMSClientError, FIRMSConfigurationError
from app.services.firms_ingestion import firms_ingestion

router = APIRouter(prefix="/ingestion", tags=["NASA FIRMS ingestion"])


def _authorize(authorization: str | None) -> None:
    """Require a bearer token only when an operator configures one."""
    configured_token = settings.firms_ingestion_token
    if not configured_token:
        return
    expected = f"Bearer {configured_token}"
    if authorization is None or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Valid ingestion authorization is required.")


def _raise_job_error(exc: Exception) -> None:
    if isinstance(exc, KeyError):
        raise HTTPException(status_code=404, detail=str(exc).strip("'")) from exc
    if isinstance(exc, FIRMSConfigurationError):
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if isinstance(exc, RuntimeError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, FIRMSClientError):
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    raise HTTPException(status_code=500, detail="FIRMS ingestion operation failed.") from exc


@router.get("/status", response_model=IngestionStatusResponse)
async def ingestion_status() -> JSONResponse:
    """Return sanitized NRT and historical status; credentials are never included."""
    payload = IngestionStatusResponse.model_validate(firms_ingestion.get_status()).model_dump(mode="json")
    return JSONResponse(content=payload)


@router.get("/nrt/status", response_model=NRTIngestionStatus)
async def nrt_status() -> JSONResponse:
    payload = NRTIngestionStatus.model_validate(firms_ingestion.get_nrt_status()).model_dump(mode="json")
    return JSONResponse(content=payload)


@router.post("/nrt/run", status_code=status.HTTP_202_ACCEPTED)
async def run_nrt(authorization: str | None = Header(default=None)) -> dict[str, object]:
    _authorize(authorization)
    try:
        return firms_ingestion.start_nrt_manual()
    except Exception as exc:
        _raise_job_error(exc)


@router.get("/historical/status")
async def historical_status(job_id: str | None = None) -> JSONResponse:
    try:
        return JSONResponse(content=firms_ingestion.get_historical_status(job_id))
    except Exception as exc:
        _raise_job_error(exc)


@router.post("/historical/start", status_code=status.HTTP_202_ACCEPTED)
def start_historical(
    request: HistoricalIngestionStartRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    _authorize(authorization)
    try:
        return firms_ingestion.create_historical_job(
            request.start_date,
            request.end_date,
            request.area,
            tuple(request.sources) if request.sources is not None else None,
        )
    except Exception as exc:
        _raise_job_error(exc)


@router.post("/historical/{job_id}/resume", status_code=status.HTTP_202_ACCEPTED)
def resume_historical(
    job_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    _authorize(authorization)
    try:
        return firms_ingestion.resume_historical_job(job_id)
    except Exception as exc:
        _raise_job_error(exc)


@router.post("/historical/{job_id}/cancel")
def cancel_historical(
    job_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    _authorize(authorization)
    try:
        return firms_ingestion.cancel_historical_job(job_id)
    except Exception as exc:
        _raise_job_error(exc)
