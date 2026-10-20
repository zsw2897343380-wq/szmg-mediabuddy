"""Database-owned published snapshots with a disposable local file cache."""

from __future__ import annotations

import hashlib
import io
import shutil
import tempfile
import threading
from pathlib import Path, PurePosixPath
from typing import Any
from zipfile import ZIP_DEFLATED, ZipFile

from octop.infra.agents.experts.publish import _replace_snapshot_dir

_CACHE_MARKER = ".snapshot-sha256"
_CACHE_LOCK = threading.Lock()


def snapshot_archive(snapshot_dir: Path) -> bytes:
    """Pack the already filtered publication, including its manifest and avatar."""
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(snapshot_dir.rglob("*")):
            if path.is_file() and path.name != _CACHE_MARKER:
                archive.write(path, path.relative_to(snapshot_dir).as_posix())
    return buffer.getvalue()


def initialize_published_snapshots(services: Any) -> None:
    """Restore database snapshots and adopt legacy publications on startup."""
    for row in services.published_expert_repo.list_all():
        published_snapshot_dir(services, row.id)


def published_snapshot_dir(services: Any, expert_id: str) -> Path:
    """Backfill legacy snapshots, or materialize the database version on demand."""
    repo = services.published_expert_repo
    dest = Path(services.paths.published_experts_dir) / expert_id
    with _CACHE_LOCK:
        digest = repo.get_snapshot_digest(expert_id)
        if digest is None and (dest / "manifest.json").is_file():
            repo.backfill_snapshot_archive(expert_id, snapshot_archive(dest))
            digest = repo.get_snapshot_digest(expert_id)
        if digest is None:
            return dest
        marker = dest / _CACHE_MARKER
        if marker.is_file() and marker.read_text(encoding="ascii") == digest:
            return dest
        payload = repo.get_snapshot_archive(expert_id)
        if payload is None:
            return dest
        # Fetch can race a refresh in another process; stamp the fetched version.
        digest = hashlib.sha256(payload).hexdigest()
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix=f".{expert_id}.", dir=dest.parent))
        try:
            with ZipFile(io.BytesIO(payload)) as archive:
                for entry in archive.infolist():
                    rel = PurePosixPath(entry.filename)
                    if (
                        rel.is_absolute()
                        or ".." in rel.parts
                        or "\\" in entry.filename
                        or ":" in entry.filename
                    ):
                        raise ValueError("Invalid published snapshot archive path")
                    if entry.is_dir():
                        continue
                    target = staging.joinpath(*rel.parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(entry))
            (staging / _CACHE_MARKER).write_text(digest, encoding="ascii")
            _replace_snapshot_dir(staging, dest)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    return dest
