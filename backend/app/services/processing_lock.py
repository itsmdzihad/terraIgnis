"""Cross-process lock shared by manual and automated analytical rebuilds."""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.core.config import BACKEND_ROOT


@contextmanager
def analytical_processing_lock() -> Iterator[None]:
    """Serialize pipeline writers while keeping slow NASA downloads unlocked."""
    lock_path = BACKEND_ROOT / "data" / "state" / "analytical_processing.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+b") as handle:
        try:
            import fcntl
        except ImportError:  # pragma: no cover - Windows fallback
            import msvcrt

            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
