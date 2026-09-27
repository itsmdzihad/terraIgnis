"""Typed response models for the TerraIgnis dashboard statistics."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CoverageStatistics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_raw_observations: int = Field(ge=0)
    total_h3_cell_dates: int = Field(ge=0)
    unique_h3_cells: int = Field(ge=0)
    observed_dates: int = Field(ge=0)
    start_date: date | None
    end_date: date | None
    h3_resolution: int | None = Field(default=None, ge=0, le=15)


class SensorStatistics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    modis_observations: int = Field(ge=0)
    viirs_observations: int = Field(ge=0)
    modis_only_cell_dates: int = Field(ge=0)
    viirs_only_cell_dates: int = Field(ge=0)
    both_sensor_cell_dates: int = Field(ge=0)


class BurnIndexStatistics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    minimum: float | None
    maximum: float | None
    mean: float | None
    median: float | None
    p95: float | None


class AnomalyStatistics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    normal: int = Field(ge=0)
    low: int = Field(ge=0)
    high: int = Field(ge=0)
    extreme_low: int = Field(ge=0)
    extreme_high: int = Field(ge=0)
    total_anomalous: int = Field(ge=0)


class StatsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    coverage: CoverageStatistics
    sensors: SensorStatistics
    burn_index: BurnIndexStatistics
    anomalies: AnomalyStatistics
