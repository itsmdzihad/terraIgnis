"""Detailed anomaly observations backed by processed anomaly Parquet."""

from __future__ import annotations

import math
from datetime import date

import h3
from fastapi import APIRouter, HTTPException, Query

from app.core.database import fetch_all, fetch_scalar, get_dataset_path
from app.schemas.anomaly import AnomaliesResponse, AnomalyFilters, AnomalyLevel

router = APIRouter(prefix="/anomalies", tags=["anomalies"])
ANOMALY_COLUMNS = (
    "h3_cell",
    "acq_date",
    "burn_index",
    "daily_median",
    "daily_mad",
    "daily_mean",
    "daily_std",
    "robust_z_score",
    "anomaly_percentile",
    "anomaly_level",
)


def _validate_filters(
    start_date: date | None,
    end_date: date | None,
    min_robust_z: float | None,
    max_robust_z: float | None,
    min_burn_index: float | None,
    max_burn_index: float | None,
) -> None:
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    if min_robust_z is not None and not math.isfinite(min_robust_z):
        raise HTTPException(status_code=422, detail="min_robust_z must be a finite number")
    if max_robust_z is not None and not math.isfinite(max_robust_z):
        raise HTTPException(status_code=422, detail="max_robust_z must be a finite number")
    if min_robust_z is not None and max_robust_z is not None and min_robust_z > max_robust_z:
        raise HTTPException(status_code=422, detail="min_robust_z must be less than or equal to max_robust_z")
    if min_burn_index is not None and max_burn_index is not None and min_burn_index > max_burn_index:
        raise HTTPException(status_code=422, detail="min_burn_index must be less than or equal to max_burn_index")


def _validate_h3_cell(h3_cell: str) -> str:
    if not h3.is_valid_cell(h3_cell):
        raise HTTPException(status_code=422, detail="h3_cell must be a valid H3 cell identifier")
    if h3.get_resolution(h3_cell) != 7:
        raise HTTPException(status_code=422, detail="h3_cell must use H3 resolution 7")
    return h3_cell.lower()


def _read_anomalies(
    predicates: list[str],
    filter_parameters: list[object],
    filters: AnomalyFilters,
    limit: int,
    offset: int,
    ordering: str,
) -> AnomaliesResponse:
    dataset_path = get_dataset_path("anomalies")
    where_clause = " WHERE " + " AND ".join(predicates) if predicates else ""
    from_clause = f"FROM read_parquet(?) {where_clause}"
    parameters = [dataset_path, *filter_parameters]
    total = int(fetch_scalar(f"SELECT count(*) {from_clause}", parameters) or 0)
    page = fetch_all(
        f"SELECT {', '.join(ANOMALY_COLUMNS)} {from_clause} "
        f"ORDER BY {ordering} LIMIT ? OFFSET ?",
        [*parameters, limit, offset],
    )
    return AnomaliesResponse(
        data=page,
        count=len(page),
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(page) < total,
        filters=filters,
    )


def _date_and_measure_predicates(
    date_filter: date | None,
    start_date: date | None,
    end_date: date | None,
    anomaly_level: AnomalyLevel | None,
    min_robust_z: float | None,
    max_robust_z: float | None,
    min_burn_index: float | None,
    max_burn_index: float | None,
) -> tuple[list[str], list[object]]:
    predicates: list[str] = []
    parameters: list[object] = []
    if date_filter is not None:
        predicates.append("acq_date = ?")
        parameters.append(date_filter)
    if start_date is not None:
        predicates.append("acq_date >= ?")
        parameters.append(start_date)
    if end_date is not None:
        predicates.append("acq_date <= ?")
        parameters.append(end_date)
    if anomaly_level is not None:
        predicates.append("anomaly_level = ?")
        parameters.append(anomaly_level.value)
    if min_robust_z is not None:
        predicates.append("robust_z_score >= ?")
        parameters.append(min_robust_z)
    if max_robust_z is not None:
        predicates.append("robust_z_score <= ?")
        parameters.append(max_robust_z)
    if min_burn_index is not None:
        predicates.append("burn_index >= ?")
        parameters.append(min_burn_index)
    if max_burn_index is not None:
        predicates.append("burn_index <= ?")
        parameters.append(max_burn_index)
    return predicates, parameters


@router.get("", response_model=AnomaliesResponse)
def get_anomalies(
    date_filter: date | None = Query(default=None, alias="date"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    anomaly_level: AnomalyLevel | None = Query(default=None),
    h3_cell: str | None = Query(default=None),
    min_robust_z: float | None = Query(default=None),
    max_robust_z: float | None = Query(default=None),
    min_burn_index: float | None = Query(default=None, ge=0, le=100),
    max_burn_index: float | None = Query(default=None, ge=0, le=100),
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
) -> AnomaliesResponse:
    """Return filtered anomaly records, newest dates first with stable tie-breakers."""
    _validate_filters(
        start_date, end_date, min_robust_z, max_robust_z, min_burn_index, max_burn_index
    )
    if h3_cell is not None:
        h3_cell = _validate_h3_cell(h3_cell)
    predicates, parameters = _date_and_measure_predicates(
        date_filter, start_date, end_date, anomaly_level,
        min_robust_z, max_robust_z, min_burn_index, max_burn_index,
    )
    if h3_cell is not None:
        predicates.append("h3_cell = ?")
        parameters.append(h3_cell)
    return _read_anomalies(
        predicates,
        parameters,
        AnomalyFilters(
            date=date_filter,
            start_date=start_date,
            end_date=end_date,
            anomaly_level=anomaly_level,
            h3_cell=h3_cell,
            min_robust_z=min_robust_z,
            max_robust_z=max_robust_z,
            min_burn_index=min_burn_index,
            max_burn_index=max_burn_index,
            limit=limit,
            offset=offset,
        ),
        limit,
        offset,
        "acq_date DESC, robust_z_score DESC NULLS LAST, h3_cell ASC",
    )


@router.get("/{h3_cell}", response_model=AnomaliesResponse)
def get_anomaly_history(
    h3_cell: str,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
) -> AnomaliesResponse:
    """Return observed anomaly history for one resolution-7 H3 cell, oldest first."""
    _validate_filters(start_date, end_date, None, None, None, None)
    h3_cell = _validate_h3_cell(h3_cell)
    predicates = ["h3_cell = ?"]
    parameters: list[object] = [h3_cell]
    if start_date is not None:
        predicates.append("acq_date >= ?")
        parameters.append(start_date)
    if end_date is not None:
        predicates.append("acq_date <= ?")
        parameters.append(end_date)
    return _read_anomalies(
        predicates,
        parameters,
        AnomalyFilters(
            start_date=start_date,
            end_date=end_date,
            h3_cell=h3_cell,
            limit=limit,
            offset=offset,
        ),
        limit,
        offset,
        "acq_date ASC, robust_z_score DESC NULLS LAST, h3_cell ASC",
    )
