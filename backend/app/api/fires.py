"""Spatial fire-data endpoint backed by the processed anomaly Parquet."""

from __future__ import annotations

from datetime import date
from typing import Literal

import h3
from fastapi import APIRouter, HTTPException, Query

from app.core.database import fetch_all, fetch_scalar, get_dataset_path
from app.schemas.fire import FireFilters, FiresResponse

router = APIRouter(prefix="/fires", tags=["fires"])
SENSOR_FILTER = Literal["MODIS", "VIIRS", "BOTH"]

FIRE_COLUMNS = (
    "h3_cell",
    "acq_date",
    "burn_index",
    "anomaly_level",
    "robust_z_score",
    "anomaly_percentile",
    "baseline_method",
    "daily_median",
    "daily_mad",
    "sensor_presence",
    "sensor_count",
    "total_fire_count",
    "modis_fire_count",
    "viirs_fire_count",
    "day_fire_count",
    "night_fire_count",
    "total_frp",
    "modis_frp_sum",
    "viirs_frp_sum",
    "modis_frp_mean",
    "viirs_frp_mean",
    "modis_brightness_mean",
    "viirs_brightness_mean",
    "modis_brightness_longwave_mean",
    "viirs_brightness_longwave_mean",
    "modis_confidence_mean",
    "viirs_low_confidence_count",
    "viirs_nominal_confidence_count",
    "viirs_high_confidence_count",
    "harmonized_fire_activity",
    "harmonized_frp_index",
)


@router.get("", response_model=FiresResponse)
def get_fires(
    date_filter: date | None = Query(default=None, alias="date"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    h3_cell: str | None = Query(default=None),
    min_burn_index: float | None = Query(default=None, ge=0, le=100),
    max_burn_index: float | None = Query(default=None, ge=0, le=100),
    sensor: SENSOR_FILTER | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
) -> FiresResponse:
    """Return a filtered, paginated view of detected H3 cell/date records."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    if min_burn_index is not None and max_burn_index is not None and min_burn_index > max_burn_index:
        raise HTTPException(status_code=422, detail="min_burn_index must be less than or equal to max_burn_index")
    if h3_cell is not None:
        if not h3.is_valid_cell(h3_cell):
            raise HTTPException(status_code=422, detail="h3_cell must be a valid H3 cell identifier")
        if h3.get_resolution(h3_cell) != 7:
            raise HTTPException(status_code=422, detail="h3_cell must use H3 resolution 7")
        h3_cell = h3_cell.lower()

    dataset_path = get_dataset_path("anomalies")
    predicates: list[str] = []
    parameters: list[object] = [dataset_path]
    if date_filter is not None:
        predicates.append("acq_date = ?")
        parameters.append(date_filter)
    if start_date is not None:
        predicates.append("acq_date >= ?")
        parameters.append(start_date)
    if end_date is not None:
        predicates.append("acq_date <= ?")
        parameters.append(end_date)
    if h3_cell is not None:
        predicates.append("h3_cell = ?")
        parameters.append(h3_cell)
    if min_burn_index is not None:
        predicates.append("burn_index >= ?")
        parameters.append(min_burn_index)
    if max_burn_index is not None:
        predicates.append("burn_index <= ?")
        parameters.append(max_burn_index)
    if sensor == "MODIS":
        predicates.append("sensor_presence IN (?, ?)")
        parameters.extend(["MODIS", "MODIS+VIIRS"])
    elif sensor == "VIIRS":
        predicates.append("sensor_presence IN (?, ?)")
        parameters.extend(["VIIRS", "MODIS+VIIRS"])
    elif sensor == "BOTH":
        predicates.append("sensor_presence = ?")
        parameters.append("MODIS+VIIRS")

    where_clause = " WHERE " + " AND ".join(predicates) if predicates else ""
    from_clause = f"FROM read_parquet(?) {where_clause}"
    total = int(fetch_scalar(f"SELECT count(*) {from_clause}", parameters) or 0)
    page = fetch_all(
        f"SELECT {', '.join(FIRE_COLUMNS)} {from_clause} "
        "ORDER BY acq_date, h3_cell LIMIT ? OFFSET ?",
        [*parameters, limit, offset],
    )
    return FiresResponse(
        data=page,
        count=len(page),
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(page) < total,
        filters=FireFilters(
            date=date_filter,
            start_date=start_date,
            end_date=end_date,
            h3_cell=h3_cell,
            min_burn_index=min_burn_index,
            max_burn_index=max_burn_index,
            sensor=sensor,
            limit=limit,
            offset=offset,
        ),
    )
