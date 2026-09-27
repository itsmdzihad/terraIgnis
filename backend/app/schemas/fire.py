"""Typed response models for the spatial fires endpoint."""

from __future__ import annotations

from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SensorFilter = Literal["MODIS", "VIIRS", "BOTH"]
SensorPresence = Literal["MODIS", "VIIRS", "MODIS+VIIRS"]
AnomalyLevel = Literal["extreme_low", "low", "normal", "high", "extreme_high", "unavailable"]


class FireRecord(BaseModel):
    """One detected H3 cell/date record with analytical provenance."""

    model_config = ConfigDict(extra="forbid")

    h3_cell: str
    acq_date: Date
    burn_index: float = Field(ge=0, le=100)
    anomaly_level: AnomalyLevel | None = None
    robust_z_score: float | None = None
    anomaly_percentile: float | None = Field(default=None, ge=0, le=1)
    baseline_method: str | None = None
    daily_median: float | None = None
    daily_mad: float | None = None
    sensor_presence: SensorPresence
    sensor_count: int = Field(ge=1, le=2)
    total_fire_count: int = Field(ge=1)
    modis_fire_count: int = Field(ge=0)
    viirs_fire_count: int = Field(ge=0)
    day_fire_count: int = Field(ge=0)
    night_fire_count: int = Field(ge=0)
    total_frp: float | None = None
    modis_frp_sum: float | None = None
    viirs_frp_sum: float | None = None
    modis_frp_mean: float | None = None
    viirs_frp_mean: float | None = None
    modis_brightness_mean: float | None = None
    viirs_brightness_mean: float | None = None
    modis_brightness_longwave_mean: float | None = None
    viirs_brightness_longwave_mean: float | None = None
    modis_confidence_mean: float | None = None
    viirs_low_confidence_count: int = Field(ge=0)
    viirs_nominal_confidence_count: int = Field(ge=0)
    viirs_high_confidence_count: int = Field(ge=0)
    harmonized_fire_activity: float | None = None
    harmonized_frp_index: float | None = None


class FireFilters(BaseModel):
    """Filters and pagination values applied to a fire query."""

    date: Date | None = None
    start_date: Date | None = None
    end_date: Date | None = None
    h3_cell: str | None = None
    min_burn_index: float | None = None
    max_burn_index: float | None = None
    sensor: SensorFilter | None = None
    limit: int
    offset: int


class FiresResponse(BaseModel):
    """Paginated response from ``GET /api/fires``."""

    data: list[FireRecord]
    count: int = Field(ge=0, description="Number of records in this page")
    total: int = Field(ge=0, description="Total matching records across all pages")
    limit: int
    offset: int
    has_more: bool
    filters: FireFilters
