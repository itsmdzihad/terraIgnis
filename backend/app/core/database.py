"""Read-only DuckDB helpers for querying processed Parquet datasets."""

from __future__ import annotations

import logging
import re
from contextlib import closing
from typing import Any, Mapping, Sequence

import duckdb

from app.core.config import Settings, settings

logger = logging.getLogger(__name__)
QueryParameters = Sequence[Any] | Mapping[str, Any] | None


class DataAccessError(RuntimeError):
    """Base error for failures accessing processed analytical data."""


class DatasetUnavailableError(DataAccessError):
    """A requested processed Parquet dataset is missing or unavailable."""


class QueryExecutionError(DataAccessError):
    """A read-only analytical query could not be completed."""


def get_dataset_path(name: str, config: Settings = settings) -> str:
    """Resolve a known dataset path, returning a sanitized error when missing."""
    path = config.dataset_path(name)
    if not path.is_file():
        raise DatasetUnavailableError(f"Processed dataset '{name}' is unavailable.")
    return str(path)


def create_connection() -> duckdb.DuckDBPyConnection:
    """Create a lightweight, operation-scoped in-memory DuckDB connection."""
    try:
        return duckdb.connect(database=":memory:")
    except duckdb.Error as exc:
        logger.exception("Could not create DuckDB connection")
        raise QueryExecutionError("The analytical data service is unavailable.") from exc


def _validate_read_query(query: str) -> str:
    """Allow one read-only SELECT/CTE statement; reject mutating SQL."""
    statement = query.strip()
    if not statement:
        raise QueryExecutionError("A read-only query is required.")
    without_comments = re.sub(r"/\*.*?\*/|--[^\n]*", " ", statement, flags=re.DOTALL)
    without_strings = re.sub(r"'(?:''|[^'])*'", "''", without_comments)
    if ";" in without_strings.rstrip().rstrip(";"):
        raise QueryExecutionError("Only one read-only query may be executed at a time.")
    if not re.match(r"^(SELECT|WITH)\b", without_strings, flags=re.IGNORECASE):
        raise QueryExecutionError("Only read-only SELECT queries are supported.")
    mutation = re.search(
        r"\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|COPY|ATTACH|DETACH|CALL|PRAGMA|SET|RESET|EXPORT|IMPORT|INSTALL|LOAD)\b",
        without_strings,
        flags=re.IGNORECASE,
    )
    if mutation:
        raise QueryExecutionError("Only read-only SELECT queries are supported.")
    return statement.rstrip().removesuffix(";")


def _execute(query: str, parameters: QueryParameters = None) -> tuple[list[str], list[tuple[Any, ...]]]:
    statement = _validate_read_query(query)
    try:
        with closing(create_connection()) as connection:
            cursor = connection.execute(statement, parameters or [])
            columns = [item[0] for item in cursor.description or []]
            rows = cursor.fetchall()
        return columns, rows
    except DataAccessError:
        raise
    except duckdb.Error as exc:
        logger.exception("DuckDB read query failed")
        raise QueryExecutionError("The analytical data query could not be completed.") from exc


def fetch_all(query: str, parameters: QueryParameters = None) -> list[dict[str, Any]]:
    """Execute a parameterized read query and return rows as dictionaries."""
    columns, rows = _execute(query, parameters)
    return [dict(zip(columns, row)) for row in rows]


def fetch_one(query: str, parameters: QueryParameters = None) -> dict[str, Any] | None:
    """Return the first result row, or ``None`` when the query returns no rows."""
    columns, rows = _execute(query, parameters)
    return dict(zip(columns, rows[0])) if rows else None


def fetch_scalar(query: str, parameters: QueryParameters = None) -> Any:
    """Return the first column of the first result row, or ``None`` if absent."""
    columns, rows = _execute(query, parameters)
    if not columns or not rows:
        return None
    return rows[0][0]
