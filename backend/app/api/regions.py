"""H3-cell spatial summaries backed by processed anomaly Parquet."""

from __future__ import annotations

from datetime import date

import h3
from fastapi import APIRouter, HTTPException, Query

from app.core.database import fetch_one, get_dataset_path
from app.schemas.regions import H3RegionSummary

router = APIRouter(prefix="/regions", tags=["regions"])


@router.get("/{h3_cell}", response_model=H3RegionSummary)
def get_h3_region_summary(
    h3_cell: str,
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
) -> H3RegionSummary:
    """Summarize observed fire activity for one H3 resolution-7 cell."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(status_code=422, detail="start_date must be on or before end_date")
    if not h3.is_valid_cell(h3_cell):
        raise HTTPException(status_code=422, detail="h3_cell must be a valid H3 cell identifier")
    if h3.get_resolution(h3_cell) != 7:
        raise HTTPException(status_code=422, detail="h3_cell must use H3 resolution 7")
    h3_cell = h3_cell.lower()

    predicates = ["h3_cell = ?"]
    parameters: list[object] = [get_dataset_path("anomalies"), h3_cell]
    if start_date is not None:
        predicates.append("acq_date >= ?")
        parameters.append(start_date)
    if end_date is not None:
        predicates.append("acq_date <= ?")
        parameters.append(end_date)
    summary = fetch_one(
        "SELECT h3_cell, count(*) AS observed_cell_dates, "
        "min(acq_date) AS first_observed_date, max(acq_date) AS last_observed_date, "
        "sum(total_fire_count) AS total_fire_detections, avg(burn_index) AS mean_burn_index, "
        "max(burn_index) AS max_burn_index, min(burn_index) AS min_burn_index, "
        "count(*) FILTER (WHERE anomaly_level <> 'normal') AS anomaly_count, "
        "count(*) FILTER (WHERE anomaly_level IN ('extreme_low', 'extreme_high')) AS extreme_anomaly_count, "
        "sum(modis_fire_count) AS modis_fire_detections, "
        "sum(viirs_fire_count) AS viirs_fire_detections "
        f"FROM read_parquet(?) WHERE {' AND '.join(predicates)} GROUP BY h3_cell",
        parameters,
    )
    if summary is None:
        raise HTTPException(status_code=404, detail="No observations found for this H3 cell.")
    return H3RegionSummary(**summary)
