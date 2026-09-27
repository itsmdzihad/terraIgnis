"""Daily calendar summaries aggregated from processed anomaly Parquet."""

from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.core.database import fetch_all, fetch_scalar, get_dataset_path
from app.schemas.calendar import CalendarFilters, CalendarResponse

router = APIRouter(prefix="/calendar", tags=["calendar"])
ANOMALY_LEVEL = Literal["extreme_low", "low", "normal", "high", "extreme_high"]


@router.get("", response_model=CalendarResponse)
def get_calendar(
    date_filter: date | None = Query(default=None, alias="date"),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    anomaly_level: ANOMALY_LEVEL | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=366),
    offset: int = Query(default=0, ge=0),
) -> CalendarResponse:
    """Return per-date fire summaries without filling dates absent from source data."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")

    dataset_path = get_dataset_path("anomalies")
    predicates: list[str] = []
    where_parameters: list[object] = []
    if date_filter is not None:
        predicates.append("acq_date = ?")
        where_parameters.append(date_filter)
    if start_date is not None:
        predicates.append("acq_date >= ?")
        where_parameters.append(start_date)
    if end_date is not None:
        predicates.append("acq_date <= ?")
        where_parameters.append(end_date)

    where_clause = " WHERE " + " AND ".join(predicates) if predicates else ""
    from_clause = f"FROM read_parquet(?) {where_clause}"
    total = int(
        fetch_scalar(
            f"SELECT count(DISTINCT acq_date) {from_clause}",
            [dataset_path, *where_parameters],
        )
        or 0
    )

    if anomaly_level is None:
        anomaly_expression = "count(*) FILTER (WHERE anomaly_level <> 'normal')"
        select_parameters: list[object] = []
    else:
        anomaly_expression = "count(*) FILTER (WHERE anomaly_level = ?)"
        select_parameters = [anomaly_level]
    page = fetch_all(
        "SELECT acq_date AS date, count(*) AS fire_count, "
        f"avg(burn_index) AS mean_burn_index, max(burn_index) AS max_burn_index, {anomaly_expression} AS anomaly_count "
        f"{from_clause} GROUP BY acq_date ORDER BY acq_date LIMIT ? OFFSET ?",
        [*select_parameters, dataset_path, *where_parameters, limit, offset],
    )
    return CalendarResponse(
        data=page,
        count=len(page),
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(page) < total,
        filters=CalendarFilters(
            date=date_filter,
            start_date=start_date,
            end_date=end_date,
            anomaly_level=anomaly_level,
            limit=limit,
            offset=offset,
        ),
    )
