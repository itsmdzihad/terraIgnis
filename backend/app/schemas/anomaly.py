"""Typed response models for detailed anomaly observations."""

from __future__ import annotations

from datetime import date as Date
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class AnomalyLevel(str, Enum):
    extreme_low = "extreme_low"
    low = "low"
    normal = "normal"
    high = "high"
    extreme_high = "extreme_high"


class AnomalyRecord(BaseModel):
    """An existing detected-fire H3 cell/date observation with anomaly context."""

    model_config = ConfigDict(extra="forbid")

    h3_cell: str
    acq_date: Date
    burn_index: float = Field(ge=0, le=100)
    daily_median: float | None
    daily_mad: float | None
    daily_mean: float | None
    daily_std: float | None
    robust_z_score: float | None
    anomaly_percentile: float | None = Field(default=None, ge=0, le=1)
    anomaly_level: AnomalyLevel


class AnomalyFilters(BaseModel):
    """Filters and pagination values applied to an anomaly query."""

    date: Date | None = None
    start_date: Date | None = None
    end_date: Date | None = None
    anomaly_level: AnomalyLevel | None = None
    h3_cell: str | None = None
    min_robust_z: float | None = None
    max_robust_z: float | None = None
    min_burn_index: float | None = None
    max_burn_index: float | None = None
    limit: int
    offset: int


class AnomaliesResponse(BaseModel):
    """Paginated anomaly observations from ``/api/anomalies``."""

    data: list[AnomalyRecord]
    count: int = Field(ge=0, description="Number of anomaly records in this page")
    total: int = Field(ge=0, description="Total records matching filters before pagination")
    limit: int
    offset: int
    has_more: bool
    filters: AnomalyFilters
