"""Database-owned skill package files with a replaceable local cache."""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import tempfile
import threading
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

if TYPE_CHECKING:
    from octop.infra.db.repos.skill_packages import SkillPackageRepo

CACHE_MARKER = ".snapshot-sha256"
CACHE_LOCK = threading.RLock()


def snapshot_archive(directory: Path) -> bytes:
    """Include binary attachments and empty directories, without following links."""
    output = io.BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for path in sorted(directory.rglob("*")):
            if path.is_symlink() or path == directory / CACHE_MARKER:
                continue
            archive.write(path, path.relative_to(directory).as_posix())
    return output.getvalue()


def replace_directory(staging: Path, destination: Path) -> None:
    """Swap a complete cache into place and roll back a failed filesystem swap."""
    previous = destination.with_name(f".{destination.name}.previous-{uuid4().hex}")
    moved = destination.exists()
    if moved:
        os.replace(destination, previous)
    try:
        os.replace(staging, destination)
    except BaseException:
        if moved and not destination.exists():
            os.replace(previous, destination)
        raise
    if moved:
        shutil.rmtree(previous, ignore_errors=True)


def package_skills_dir(
    repo: SkillPackageRepo, root: Path, package_id: str, *, force: bool = False
) -> Path:
    destination = root / package_id / "skills"
    with CACHE_LOCK:
        digest = repo.get_snapshot_digest(package_id)
        if digest is None and destination.is_dir():
            repo.save_snapshot(package_id, snapshot_archive(destination), expected_digest=None)
            digest = repo.get_snapshot_digest(package_id)
        if digest is None:
            return destination
        marker = destination / CACHE_MARKER
        if not force and marker.is_file() and marker.read_text(encoding="ascii") == digest:
            return destination
        payload = repo.get_snapshot_archive(package_id)
        if payload is None:
            return destination
        digest = hashlib.sha256(payload).hexdigest()
        destination.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix=".skills-restore-", dir=destination.parent))
        try:
            with ZipFile(io.BytesIO(payload)) as archive:
                for entry in archive.infolist():
                    original_path = entry.orig_filename
                    rel = PurePosixPath(original_path)
                    if (
                        rel.is_absolute()
                        or ".." in rel.parts
                        or "\\" in original_path
                        or ":" in original_path
                        or "\x00" in original_path
                    ):
                        raise ValueError("Invalid skill package snapshot archive path")
                    target = staging.joinpath(*rel.parts)
                    if entry.is_dir():
                        target.mkdir(parents=True, exist_ok=True)
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(archive.read(entry))
            (staging / CACHE_MARKER).write_text(digest, encoding="ascii")
            replace_directory(staging, destination)
        finally:
            if staging.exists():
                shutil.rmtree(staging)
    return destination
