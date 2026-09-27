"""Typed response models for the daily fire activity calendar."""

from __future__ import annotations

from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AnomalyLevel = Literal["extreme_low", "low", "normal", "high", "extreme_high"]


class CalendarDay(BaseModel):
    """Summary of observed H3 fire records for one acquisition date."""

    model_config = ConfigDict(extra="forbid")

    date: Date
    fire_count: int = Field(ge=0, description="Observed H3 cell/date fire records")
    mean_burn_index: float | None
    max_burn_index: float | None
    anomaly_count: int = Field(
        ge=0,
        description="Non-normal records, or records at the requested anomaly_level",
    )


class CalendarFilters(BaseModel):
    """Filters and pagination values applied to the calendar query."""

    date: Date | None = None
    start_date: Date | None = None
    end_date: Date | None = None
    anomaly_level: AnomalyLevel | None = None
    limit: int
    offset: int


class CalendarResponse(BaseModel):
    """Paginated daily summaries from ``GET /api/calendar``."""

    data: list[CalendarDay]
    count: int = Field(ge=0, description="Number of daily records in this page")
    total: int = Field(ge=0, description="Total observed dates matching date filters")
    limit: int
    offset: int
    has_more: bool
    filters: CalendarFilters
