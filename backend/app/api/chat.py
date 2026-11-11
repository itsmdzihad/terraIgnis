"""Ignish chat grounded in read-only TerraIgnis fire datasets."""

from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal

import h3
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.database import fetch_all, fetch_one, get_dataset_path
from app.services.firms_ingestion import firms_ingestion

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-6-astra"
COUNTRY_BOUNDARIES_PATH = Path(__file__).resolve().parents[1] / "data" / "world-countries.geojson"


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=3000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=16)


class ChatResponse(BaseModel):
    agent: Literal["Ignish"] = "Ignish"
    reply: str


DATA_TOOL = {
    "type": "function",
    "name": "get_fire_data",
    "description": (
        "Query TerraIgnis's existing NASA FIRMS and processed fire datasets. "
        "Call this for questions about fire detections, regions, dates, sensors, "
        "Burn Index, H3 cells, or anomalies. Country requests use the bundled "
        "Natural Earth country boundaries and match H3 cells by cell center."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {
            "region_scope": {
                "type": "string",
                "enum": ["global", "country"],
                "description": "Choose global for worldwide data or country for one named country.",
            },
            "country": {
                "type": "string",
                "description": "Country name when region_scope is country; otherwise an empty string.",
            },
            "start_date": {
                "type": "string",
                "description": "Inclusive YYYY-MM-DD start date, or an empty string for no lower bound.",
            },
            "end_date": {
                "type": "string",
                "description": "Inclusive YYYY-MM-DD end date, or an empty string for no upper bound.",
            },
            "sensor": {
                "type": "string",
                "enum": ["ALL", "MODIS", "VIIRS"],
                "description": "Sensor selection for the raw observations and processed summaries.",
            },
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 20,
                "description": "Maximum number of daily and H3-cell detail rows to return.",
            },
        },
        "required": ["region_scope", "country", "start_date", "end_date", "sensor", "limit"],
        "additionalProperties": False,
    },
}

INGESTION_STATUS_TOOL = {
    "type": "function",
    "name": "get_ingestion_status",
    "description": (
        "Read the latest TerraIgnis NASA FIRMS ingestion status, including NRT polling, "
        "last successful update, and historical backfill progress. This is read-only; "
        "it never starts, resumes, or cancels an ingestion job."
    ),
    "strict": True,
    "parameters": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": False,
    },
}


def _query_ingestion_status() -> dict[str, object]:
    """Return only safe operational state for Ignish; never expose credentials."""
    status = firms_ingestion.get_status()
    return {
        "nrt": status.get("nrt", {}),
        "historical": status.get("historical", {}),
    }


def _parse_date(value: str, field_name: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format.") from exc


@lru_cache(maxsize=1)
def _load_country_features() -> list[dict[str, object]]:
    if not COUNTRY_BOUNDARIES_PATH.is_file():
        raise RuntimeError(f"Country boundary data is missing: {COUNTRY_BOUNDARIES_PATH}")
    collection = json.loads(COUNTRY_BOUNDARIES_PATH.read_text(encoding="utf-8"))
    return collection.get("features", [])


def _normalize_country(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    ascii_name = "".join(character for character in normalized if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]", "", ascii_name)


def _find_country(country_name: str) -> dict[str, object]:
    aliases = {
        "us": "unitedstatesofamerica", "usa": "unitedstatesofamerica",
        "uk": "unitedkingdom", "britain": "unitedkingdom",
        "ivorycoast": "cotedivoire",
        "turkiye": "turkey", "burma": "myanmar",
    }
    normalized = _normalize_country(country_name)
    normalized = aliases.get(normalized, normalized)
    features = _load_country_features()
    for feature in features:
        properties = feature.get("properties", {})
        if isinstance(properties, dict):
            names = [value for value in properties.values() if isinstance(value, str)]
            if any(_normalize_country(name) == normalized for name in names):
                return feature
    raise ValueError(f"I could not match '{country_name}' to a country in the country-boundary dataset.")


def _country_polygons(feature: dict[str, object]) -> list[list[list[list[float]]]]:
    geometry = feature.get("geometry") or {}
    if not isinstance(geometry, dict):
        return []
    coordinates = geometry.get("coordinates", [])
    if geometry.get("type") == "Polygon":
        return [coordinates]
    if geometry.get("type") == "MultiPolygon":
        return coordinates
    return []


def _point_in_ring(longitude: float, latitude: float, ring: list[list[float]]) -> bool:
    inside = False
    previous = ring[-1]
    for current in ring:
        x1, y1 = float(current[0]), float(current[1])
        x2, y2 = float(previous[0]), float(previous[1])
        if (y1 > latitude) != (y2 > latitude):
            crossing_x = (x2 - x1) * (latitude - y1) / (y2 - y1) + x1
            if longitude < crossing_x:
                inside = not inside
        previous = current
    return inside


def _point_in_country(longitude: float, latitude: float, feature: dict[str, object]) -> bool:
    for polygon in _country_polygons(feature):
        if polygon and _point_in_ring(longitude, latitude, polygon[0]):
            if not any(_point_in_ring(longitude, latitude, hole) for hole in polygon[1:]):
                return True
    return False


def _country_bounds(feature: dict[str, object]) -> tuple[float, float, float, float]:
    coordinates = [point for polygon in _country_polygons(feature) for ring in polygon for point in ring]
    longitudes = [float(point[0]) for point in coordinates]
    latitudes = [float(point[1]) for point in coordinates]
    if not coordinates:
        raise ValueError("The selected country has no usable boundary geometry.")
    return min(latitudes), max(latitudes), min(longitudes), max(longitudes)


def _country_label(feature: dict[str, object]) -> str:
    properties = feature.get("properties", {})
    if isinstance(properties, dict):
        return str(properties.get("ADMIN") or properties.get("NAME_EN") or properties.get("NAME") or "selected country")
    return "selected country"


def _raw_filter(
    arguments: dict[str, object],
) -> tuple[str, list[object], date | None, date | None, list[str] | None, dict[str, object] | None]:
    region_scope = str(arguments["region_scope"])
    country_feature = _find_country(str(arguments["country"])) if region_scope == "country" else None
    start_date = _parse_date(str(arguments["start_date"]), "start_date")
    end_date = _parse_date(str(arguments["end_date"]), "end_date")
    if start_date and end_date and start_date > end_date:
        raise ValueError("start_date must be on or before end_date.")

    predicates: list[str] = []
    parameters: list[object] = [get_dataset_path("standardized_fires")]
    if country_feature is not None:
        min_latitude, max_latitude, min_longitude, max_longitude = _country_bounds(country_feature)
        predicates.extend((
            "latitude BETWEEN ? AND ?",
            "longitude BETWEEN ? AND ?",
        ))
        parameters.extend((
            min_latitude, max_latitude, min_longitude, max_longitude,
        ))

    if start_date:
        predicates.append("acq_date >= ?")
        parameters.append(start_date)
    if end_date:
        predicates.append("acq_date <= ?")
        parameters.append(end_date)

    sensor = str(arguments["sensor"])
    if sensor in {"MODIS", "VIIRS"}:
        predicates.append("sensor = ?")
        parameters.append(sensor)

    where = " WHERE " + " AND ".join(predicates) if predicates else ""

    matching_cells: list[str] | None = None
    if country_feature is not None:
        h3_path = get_dataset_path("h3_fire_daily")
        cells = fetch_all("SELECT DISTINCT h3_cell FROM read_parquet(?)", [h3_path])
        matching_cells = []
        for row in cells:
            cell = str(row["h3_cell"])
            latitude, longitude = h3.cell_to_latlng(cell)
            if _point_in_country(longitude, latitude, country_feature):
                matching_cells.append(cell)

    return where, parameters, start_date, end_date, matching_cells, country_feature


def _query_fire_data(arguments: dict[str, object]) -> dict[str, object]:
    where, parameters, start_date, end_date, matching_cells, country_feature = _raw_filter(arguments)
    limit = max(1, min(int(arguments["limit"]), 20))
    raw_path = get_dataset_path("standardized_fires")
    if country_feature is None:
        raw_summary = fetch_one(
            "SELECT count(*) AS detections, count(DISTINCT acq_date) AS active_days, "
            "min(acq_date) AS first_observed, max(acq_date) AS last_observed, "
            "count(*) FILTER (WHERE sensor = 'MODIS') AS modis_detections, "
            "count(*) FILTER (WHERE sensor = 'VIIRS') AS viirs_detections, "
            "count(DISTINCT source_file) AS source_files, sum(frP) AS total_frp, "
            "avg(frP) AS mean_frp, max(frP) AS max_frp, avg(brightness) AS mean_brightness "
            f"FROM read_parquet(?) {where}",
            parameters,
        ) or {}
        daily_activity = fetch_all(
            "SELECT acq_date, count(*) AS detections, "
            "count(*) FILTER (WHERE sensor = 'MODIS') AS modis_detections, "
            "count(*) FILTER (WHERE sensor = 'VIIRS') AS viirs_detections, "
            "sum(frP) AS total_frp, avg(frP) AS mean_frp "
            f"FROM read_parquet(?) {where} GROUP BY acq_date ORDER BY detections DESC, acq_date LIMIT ?",
            [*parameters, limit],
        )
    else:
        candidates = fetch_all(
            "SELECT acq_date, sensor, frP, brightness, source_file, latitude, longitude "
            f"FROM read_parquet(?) {where}",
            parameters,
        )
        country_rows = [
            row for row in candidates
            if row.get("latitude") is not None and row.get("longitude") is not None
            and _point_in_country(float(row["longitude"]), float(row["latitude"]), country_feature)
        ]
        dates = [row["acq_date"] for row in country_rows]
        frp_values = [float(row["frP"]) for row in country_rows if row.get("frP") is not None]
        brightness_values = [float(row["brightness"]) for row in country_rows if row.get("brightness") is not None]
        raw_summary = {
            "detections": len(country_rows),
            "active_days": len(set(dates)),
            "first_observed": min(dates) if dates else None,
            "last_observed": max(dates) if dates else None,
            "modis_detections": sum(row["sensor"] == "MODIS" for row in country_rows),
            "viirs_detections": sum(row["sensor"] == "VIIRS" for row in country_rows),
            "source_files": len({row["source_file"] for row in country_rows}),
            "total_frp": sum(frp_values),
            "mean_frp": sum(frp_values) / len(frp_values) if frp_values else None,
            "max_frp": max(frp_values) if frp_values else None,
            "mean_brightness": sum(brightness_values) / len(brightness_values) if brightness_values else None,
        }
        by_day: dict[object, list[dict[str, object]]] = {}
        for row in country_rows:
            by_day.setdefault(row["acq_date"], []).append(row)
        daily_activity = [
            {
                "acq_date": day,
                "detections": len(rows),
                "modis_detections": sum(row["sensor"] == "MODIS" for row in rows),
                "viirs_detections": sum(row["sensor"] == "VIIRS" for row in rows),
                "total_frp": sum(float(row["frP"]) for row in rows if row.get("frP") is not None),
                "mean_frp": (
                    sum(float(row["frP"]) for row in rows if row.get("frP") is not None)
                    / sum(row.get("frP") is not None for row in rows)
                    if any(row.get("frP") is not None for row in rows) else None
                ),
            }
            for day, rows in sorted(by_day.items(), key=lambda item: (-len(item[1]), item[0]))[:limit]
        ]

    analytics = {
        "cell_date_records": 0,
        "unique_h3_cells": 0,
        "fire_detections": 0,
        "mean_burn_index": None,
        "max_burn_index": None,
        "anomalous_cell_dates": 0,
        "high_or_extreme_cell_dates": 0,
        "top_cells": [],
    }
    if matching_cells is None or matching_cells:
        anomaly_path = get_dataset_path("anomalies")
        anomaly_predicates: list[str] = []
        anomaly_parameters: list[object] = [anomaly_path]
        if start_date:
            anomaly_predicates.append("acq_date >= ?")
            anomaly_parameters.append(start_date)
        if end_date:
            anomaly_predicates.append("acq_date <= ?")
            anomaly_parameters.append(end_date)
        if matching_cells is not None:
            anomaly_predicates.append("h3_cell IN (SELECT UNNEST(?))")
            anomaly_parameters.append(matching_cells)
        sensor = str(arguments["sensor"])
        if sensor == "MODIS":
            anomaly_predicates.append("sensor_presence IN ('MODIS', 'MODIS+VIIRS')")
        elif sensor == "VIIRS":
            anomaly_predicates.append("sensor_presence IN ('VIIRS', 'MODIS+VIIRS')")
        anomaly_where = " WHERE " + " AND ".join(anomaly_predicates) if anomaly_predicates else ""
        analytics.update(fetch_one(
            "SELECT count(*) AS cell_date_records, count(DISTINCT h3_cell) AS unique_h3_cells, "
            "sum(total_fire_count) AS fire_detections, avg(burn_index) AS mean_burn_index, "
            "max(burn_index) AS max_burn_index, "
            "count(*) FILTER (WHERE anomaly_level != 'normal') AS anomalous_cell_dates, "
            "count(*) FILTER (WHERE anomaly_level IN ('high', 'extreme_high')) AS high_or_extreme_cell_dates "
            f"FROM read_parquet(?) {anomaly_where}",
            anomaly_parameters,
        ) or {})
        analytics["top_cells"] = fetch_all(
            "SELECT h3_cell, count(*) AS observed_cell_dates, sum(total_fire_count) AS fire_detections, "
            "avg(burn_index) AS mean_burn_index, max(burn_index) AS max_burn_index "
            f"FROM read_parquet(?) {anomaly_where} GROUP BY h3_cell "
            "ORDER BY fire_detections DESC, mean_burn_index DESC LIMIT ?",
            [*anomaly_parameters, limit],
        )

    response: dict[str, object] = {
        "region": _country_label(country_feature) if country_feature else "global",
        "sensor_filter": str(arguments["sensor"]),
        "date_filter": {
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "raw_firms_summary": raw_summary,
        "top_daily_activity": daily_activity,
        "processed_h3_and_anomaly_summary": analytics,
    }
    if country_feature:
        response["region_note"] = (
            "The country boundary comes from Natural Earth 1:50m. Raw fire observations "
            "are matched by their coordinates; processed H3 analytics use each H3 cell center, "
            "so cells along borders can differ slightly from raw-point totals."
        )
    return response


def _response_text(response: dict[str, object]) -> str:
    for item in response.get("output", []):
        if not isinstance(item, dict) or item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if isinstance(content, dict) and content.get("type") == "output_text":
                return str(content.get("text", ""))
    return ""


async def _call_openai(api_key: str, model: str, instructions: str, input_items: list[object]) -> dict[str, object]:
    payload = {
        "model": model,
        "instructions": instructions,
        "input": input_items,
        "tools": [DATA_TOOL, INGESTION_STATUS_TOOL],
        "tool_choice": "auto",
        "max_output_tokens": 1000,
        "store": False,
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(45.0)) as client:
        response = await client.post(
            OPENAI_RESPONSES_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
    if response.is_error:
        logger.error("Ignish OpenAI request failed with HTTP %s", response.status_code)
        raise HTTPException(status_code=502, detail="Ignish could not reach the language model. Check the server API key and model configuration.")
    return response.json()


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Answer a chat turn using the Responses API and read-only dataset tools."""
    api_key = os.getenv("OPENAI_API_KEY") or os.getenv("OPEN_API")
    if not api_key:
        raise HTTPException(status_code=503, detail="Ignish is not configured. Set OPENAI_API_KEY or OPEN_API in backend/.env.")

    instructions = (
        "You are Ignish, TerraIgnis's wildfire-data AI agent. Be concise, clear, and helpful. "
        "Your capabilities are strictly read-only: you may query existing processed fire datasets and read sanitized ingestion status. "
        "You cannot generate or rebuild dashboard datasets, download or upload files, export or create datasets, or start, resume, cancel, or change NRT polling or historical backfills. "
        "For any request to perform one of those actions, say plainly that you cannot do it from chat; do not say yes, imply that you will do it, or invent a generated file or result. "
        "If useful, direct the user to the Data pipeline page to perform the action manually. You may still answer questions using existing data. "
        "For questions about TerraIgnis observations or metrics, call get_fire_data before answering. "
        "For questions about data freshness, the latest FIRMS update, NRT polling, or historical backfill progress, "
        "call get_ingestion_status and answer from its returned operational status. Never claim an ingestion run "
        "was started unless the user started it through the operator controls. This status tool is read-only. "
        "Base every numerical or geographic claim on the returned database result. Never invent values. "
        "Country queries are supported for every country in the bundled Natural Earth boundary data. "
        "When a user names a country, set region_scope to country and pass its name in country. "
        "For worldwide questions, set region_scope to global and country to an empty string. "
        "If a country name cannot be matched, ask the user to clarify its spelling; do not claim country "
        "queries are unsupported. Country summaries use exact raw observation coordinates and H3 cell "
        "centers for processed analytics; explain this boundary distinction when useful. Present totals "
        "and key details in readable bullets, and say when detail rows are limited."
    )
    input_items: list[object] = [
        {"role": message.role, "content": message.content}
        for message in request.messages[-12:]
    ]
    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)

    try:
        for _ in range(3):
            response = await _call_openai(api_key, model, instructions, input_items)
            output = response.get("output", [])
            function_calls = [
                item for item in output
                if isinstance(item, dict) and item.get("type") == "function_call"
            ]
            if not function_calls:
                reply = _response_text(response)
                if not reply:
                    raise HTTPException(status_code=502, detail="Ignish returned an empty response. Please try again.")
                return ChatResponse(reply=reply)

            input_items.extend(output)
            for call in function_calls:
                if call.get("name") == "get_ingestion_status":
                    try:
                        result = _query_ingestion_status()
                    except Exception:
                        logger.exception("Ignish could not read FIRMS ingestion status")
                        result = {"error": "FIRMS ingestion status is temporarily unavailable."}
                elif call.get("name") != "get_fire_data":
                    result: object = {"error": "Unknown read-only data tool."}
                else:
                    try:
                        arguments = json.loads(str(call.get("arguments", "{}")))
                        result = _query_fire_data(arguments)
                    except (KeyError, TypeError, ValueError) as exc:
                        result = {"error": str(exc)}
                    except Exception:
                        logger.exception("Ignish could not query the processed fire datasets")
                        result = {"error": "The processed fire datasets could not be queried."}
                input_items.append({
                    "type": "function_call_output",
                    "call_id": call.get("call_id"),
                    "output": json.dumps(result, default=str, allow_nan=False),
                })
    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Ignish took too long to answer. Please try again.") from exc
    except httpx.HTTPError as exc:
        logger.exception("Ignish could not connect to OpenAI")
        raise HTTPException(status_code=502, detail="Ignish could not reach the language model. Check the backend network connection.") from exc

    return ChatResponse(reply="I couldn’t finish that answer from the database. Please try a more focused question.")
