"""Small, validated client for the NASA FIRMS Area and data availability APIs."""

from __future__ import annotations

import csv
import io
import logging
import time
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Iterable

import httpx

from app.core.config import FIRMS_PRODUCTS, Settings, settings

logger = logging.getLogger(__name__)
FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov"
MAX_DAY_RANGE = 5

AREA_REQUIRED_COLUMNS = {
    "latitude", "longitude", "acq_date", "acq_time", "satellite", "version", "frp", "daynight"
}
MODIS_COLUMNS = {"brightness", "bright_t31", "scan", "track", "confidence"}
VIIRS_COLUMNS = {"bright_ti4", "bright_ti5", "scan", "track", "confidence"}


class FIRMSClientError(RuntimeError):
    """Sanitized NASA API error safe to return from API routes and status endpoints."""


class FIRMSConfigurationError(FIRMSClientError):
    """Required FIRMS configuration is not available."""


@dataclass(frozen=True)
class CSVResult:
    headers: tuple[str, ...]
    row_count: int
    text: str


@dataclass(frozen=True)
class ProductAvailability:
    data_id: str
    min_date: date
    max_date: date


def validate_area(area: str) -> str:
    """Validate and normalize a FIRMS global or west,south,east,north area."""
    normalized = area.strip()
    if normalized.lower() == "world":
        return "world"
    try:
        bounds = [float(value.strip()) for value in normalized.split(",")]
    except ValueError as exc:
        raise ValueError("Area must be 'world' or west,south,east,north.") from exc
    if len(bounds) != 4:
        raise ValueError("Area must be 'world' or west,south,east,north.")
    west, south, east, north = bounds
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise ValueError("Area bounds are outside valid geographic ranges.")
    return ",".join(format(value, ".8g") for value in bounds)


def validate_date_range(start_date: date, end_date: date, *, max_days: int = MAX_DAY_RANGE) -> int:
    """Validate inclusive date windows and return their day count."""
    if start_date > end_date:
        raise ValueError("Start date must be on or before end date.")
    days = (end_date - start_date).days + 1
    if not 1 <= max_days <= MAX_DAY_RANGE or days > max_days:
        raise ValueError(f"FIRMS Area API requests may include at most {max_days} days.")
    return days


def split_date_range(start_date: date, end_date: date, chunk_days: int = MAX_DAY_RANGE) -> list[tuple[date, date]]:
    """Split an inclusive date range into adjacent, non-overlapping chunks."""
    if not 1 <= chunk_days <= MAX_DAY_RANGE:
        raise ValueError("Chunk size must be between 1 and 5 days.")
    if start_date > end_date:
        raise ValueError("Start date must be on or before end date.")
    chunks = []
    cursor = start_date
    from datetime import timedelta

    while cursor <= end_date:
        chunk_end = min(cursor + timedelta(days=chunk_days - 1), end_date)
        chunks.append((cursor, chunk_end))
        cursor = chunk_end + timedelta(days=1)
    return chunks


class FIRMSClient:
    """Authenticated client with bounded timeout/retries and strict CSV validation."""

    def __init__(
        self,
        config: Settings = settings,
        *,
        http_client: httpx.Client | None = None,
        sleep=time.sleep,
    ) -> None:
        self.config = config
        self._sleep = sleep
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(
            timeout=httpx.Timeout(config.firms_request_timeout, connect=min(10.0, config.firms_request_timeout)),
            follow_redirects=True,
            headers={"Accept": "text/csv"},
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> FIRMSClient:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _request_csv(
        self,
        url: str,
        *,
        required_headers: set[str],
        source: str,
        metadata: str,
    ) -> CSVResult:
        if not self.config.firms_map_key:
            raise FIRMSConfigurationError("NASA FIRMS is not configured. Set FIRMS_MAP_KEY in backend/.env.")

        last_error = "NASA FIRMS request failed."
        started = time.monotonic()
        for attempt in range(self.config.firms_max_retries + 1):
            try:
                response = self._client.get(url)
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < self.config.firms_max_retries:
                        delay = self._retry_delay(response, attempt)
                        logger.warning("NASA FIRMS temporary HTTP %d; retry %d/%d in %.1fs", response.status_code, attempt + 1, self.config.firms_max_retries, delay)
                        self._sleep(delay)
                        continue
                response.raise_for_status()
                result = parse_firms_csv(response.text, required_headers)
                logger.info(
                    "NASA FIRMS request succeeded source=%s %s http_status=%d duration_seconds=%.3f response_bytes=%d records=%d",
                    source,
                    metadata,
                    response.status_code,
                    time.monotonic() - started,
                    len(response.content),
                    result.row_count,
                )
                return result
            except FIRMSClientError:
                raise
            except httpx.HTTPStatusError as exc:
                last_error = f"NASA FIRMS returned HTTP {exc.response.status_code}."
                break
            except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as exc:
                last_error = "NASA FIRMS request timed out or the service could not be reached."
                if attempt < self.config.firms_max_retries:
                    delay = min(60.0, self.config.firms_retry_backoff_seconds * (2**attempt))
                    logger.warning("NASA FIRMS request failed (%s); retry %d/%d in %.1fs", type(exc).__name__, attempt + 1, self.config.firms_max_retries, delay)
                    self._sleep(delay)
                    continue
            except (ValueError, csv.Error) as exc:
                raise FIRMSClientError("NASA FIRMS returned an invalid CSV response.") from exc
            except httpx.HTTPError as exc:
                last_error = "NASA FIRMS request failed due to an HTTP transport error."
                if attempt < self.config.firms_max_retries:
                    self._sleep(min(60.0, self.config.firms_retry_backoff_seconds * (2**attempt)))
                    continue
                logger.error("NASA FIRMS transport failure: %s", type(exc).__name__)
        raise FIRMSClientError(last_error)

    def _retry_delay(self, response: httpx.Response, attempt: int) -> float:
        retry_after = response.headers.get("Retry-After", "").strip()
        if retry_after:
            try:
                return max(0.0, min(300.0, float(retry_after)))
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after)
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    return max(0.0, min(300.0, (retry_at - datetime.now(timezone.utc)).total_seconds()))
                except (TypeError, ValueError, OverflowError):
                    pass
        return min(60.0, self.config.firms_retry_backoff_seconds * (2**attempt))

    def fetch_area(
        self,
        source: str,
        area: str,
        start_date: date,
        end_date: date,
    ) -> CSVResult:
        """Fetch one dated API window; FIRMS DATE is the inclusive first date."""
        source = source.strip().upper()
        if source not in FIRMS_PRODUCTS:
            raise ValueError("Unsupported NASA FIRMS product.")
        days = validate_date_range(start_date, end_date)
        safe_area = validate_area(area)
        url = (
            f"{FIRMS_BASE_URL}/api/area/csv/{self.config.firms_map_key}/"
            f"{source}/{safe_area}/{days}/{start_date.isoformat()}"
        )
        required = AREA_REQUIRED_COLUMNS | (MODIS_COLUMNS if source.startswith("MODIS") else VIIRS_COLUMNS)
        return self._request_csv(
            url,
            required_headers=required,
            source=source,
            metadata=f"area={safe_area} date_start={start_date.isoformat()} date_end={end_date.isoformat()}",
        )

    def fetch_recent_area(self, source: str, area: str, days: int) -> CSVResult:
        """Fetch the latest 1–5 days without a historical date parameter."""
        source = source.strip().upper()
        if source not in FIRMS_PRODUCTS:
            raise ValueError("Unsupported NASA FIRMS product.")
        if not 1 <= days <= MAX_DAY_RANGE:
            raise ValueError("FIRMS Area API requests may include between 1 and 5 days.")
        safe_area = validate_area(area)
        url = f"{FIRMS_BASE_URL}/api/area/csv/{self.config.firms_map_key}/{source}/{safe_area}/{days}"
        required = AREA_REQUIRED_COLUMNS | (MODIS_COLUMNS if source.startswith("MODIS") else VIIRS_COLUMNS)
        return self._request_csv(
            url,
            required_headers=required,
            source=source,
            metadata=f"area={safe_area} recent_days={days}",
        )

    def fetch_availability(self) -> dict[str, ProductAvailability]:
        """Read all products' available minimum and maximum dates from NASA."""
        url = f"{FIRMS_BASE_URL}/api/data_availability/csv/{self.config.firms_map_key}/all"
        result = self._request_csv(
            url,
            required_headers={"data_id", "min_date", "max_date"},
            source="availability",
            metadata="scope=all_products",
        )
        reader = csv.DictReader(io.StringIO(result.text.lstrip("\ufeff")))
        available: dict[str, ProductAvailability] = {}
        for row in reader:
            source = (row.get("data_id") or "").strip().upper()
            if source not in FIRMS_PRODUCTS:
                continue
            try:
                minimum = date.fromisoformat((row.get("min_date") or "").strip())
                maximum = date.fromisoformat((row.get("max_date") or "").strip())
            except ValueError as exc:
                raise FIRMSClientError("NASA FIRMS returned invalid data-availability dates.") from exc
            if minimum > maximum:
                raise FIRMSClientError("NASA FIRMS returned an invalid data-availability range.")
            available[source] = ProductAvailability(source, minimum, maximum)
        return available


def parse_firms_csv(text: str, required_headers: Iterable[str]) -> CSVResult:
    """Validate a non-HTML CSV response and return its actual row count."""
    if not text or not text.strip():
        raise FIRMSClientError("NASA FIRMS returned an empty, invalid response.")
    if text.lstrip().startswith("<"):
        raise FIRMSClientError("NASA FIRMS returned an HTML error page instead of CSV data.")
    try:
        reader = csv.reader(io.StringIO(text.lstrip("\ufeff"), newline=""))
        headers = next(reader, [])
        normalized = tuple(value.strip() for value in headers)
        if not normalized or not set(required_headers).issubset(normalized):
            raise FIRMSClientError("NASA FIRMS CSV is missing required columns.")
        rows = 0
        for row in reader:
            if not row or all(not item.strip() for item in row):
                continue
            if len(row) != len(normalized):
                raise FIRMSClientError("NASA FIRMS returned a partial or malformed CSV row.")
            rows += 1
        return CSVResult(normalized, rows, text if text.endswith("\n") else text + "\n")
    except csv.Error as exc:
        raise FIRMSClientError("NASA FIRMS returned malformed CSV data.") from exc
