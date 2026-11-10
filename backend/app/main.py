"""TerraIgnis FastAPI application foundation."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import api_router
from app.core.config import settings
from app.core.database import DataAccessError, DatasetUnavailableError
from app.services.firms_ingestion import firms_ingestion

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Start opt-in FIRMS polling and resume persisted historical jobs."""
    firms_ingestion.recover_interrupted_jobs()
    firms_ingestion.start_scheduler()
    try:
        yield
    finally:
        firms_ingestion.stop_scheduler()


app = FastAPI(
    title="TerraIgnis API",
    description="TerraIgnis wildfire analytics and controlled NASA FIRMS data pipeline.",
    version="0.1.0",
    docs_url=None if settings.app_env == "production" else "/docs",
    redoc_url=None if settings.app_env == "production" else "/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Filename"],
)
app.include_router(api_router, prefix="/api")


@app.exception_handler(DataAccessError)
async def data_access_error_handler(_: Request, exc: DataAccessError) -> JSONResponse:
    """Return sanitized data-layer errors without leaking SQL, paths, or traces."""
    logger.error("Analytical data access failed: %s", type(exc).__name__)
    status_code = 503 if isinstance(exc, DatasetUnavailableError) else 500
    return JSONResponse(
        status_code=status_code,
        content={"detail": "Processed analytical data is temporarily unavailable."},
    )


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    """Confirm the app is running and the configured processed-data directory exists."""
    if not settings.data_dir.is_dir():
        raise HTTPException(status_code=503, detail="Processed data directory is unavailable.")
    return {"status": "ok"}
