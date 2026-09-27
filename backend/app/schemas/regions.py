"""Response schema for spatial summaries of H3 cells."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class H3RegionSummary(BaseModel):
    """Summary of observed H3 cell/date records for one resolution-7 cell."""

    model_config = ConfigDict(extra="forbid")

    h3_cell: str
    observed_cell_dates: int = Field(ge=1)
    first_observed_date: date
    last_observed_date: date
    total_fire_detections: int = Field(ge=0)
    mean_burn_index: float | None
    max_burn_index: float | None
    min_burn_index: float | None
    anomaly_count: int = Field(ge=0)
    extreme_anomaly_count: int = Field(ge=0)
    modis_fire_detections: int = Field(ge=0)
    viirs_fire_detections: int = Field(ge=0)
