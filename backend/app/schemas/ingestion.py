"""Request and response schemas for automated FIRMS ingestion controls."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

FIRMSStandardProduct = Literal[
    "MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP", "VIIRS_NOAA21_SP"
]


class HistoricalIngestionStartRequest(BaseModel):
    """Explicit historical date range; never starts automatically from settings."""

    model_config = ConfigDict(extra="forbid")

    start_date: date
    end_date: date
    area: str | None = Field(default=None, description="'world' or west,south,east,north")
    sources: list[FIRMSStandardProduct] | None = None

    @model_validator(mode="after")
    def validate_dates(self) -> HistoricalIngestionStartRequest:
        if self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        if self.sources is not None and not self.sources:
            raise ValueError("sources must include at least one product")
        if self.sources is not None and len(set(self.sources)) != len(self.sources):
            raise ValueError("sources cannot contain duplicates")
        return self


class NRTIngestionStatus(BaseModel):
    model_config = ConfigDict(extra="allow")

    enabled: bool
    configured: bool
    status: str
    interval_minutes: int


class HistoricalIngestionJobStatus(BaseModel):
    model_config = ConfigDict(extra="allow")

    job_id: str
    status: str
    requested_start_date: str
    requested_end_date: str
    sources: list[str]
    total_chunks: int
    completed_chunks: int
    failed_chunks: int
    progress_percent: float
    downloaded_records: int
    chunks: list[dict[str, object]]


class IngestionStatusResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    nrt: dict[str, object]
    historical: dict[str, object]
