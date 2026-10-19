"""Materialize immutable selections from host skill packages for harness roots.

Harness accepts directories containing skill folders, not individual manifests.
These caches preserve a selected skill's relative scripts/assets while preventing
unselected siblings from being discovered. They are not agent workspace files.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
from pathlib import Path


def selected_skill_root(source: Path, slugs: list[str], *, cache_root: Path) -> Path:
    """Return a complete, content-addressed root containing only selected skills.

    The caller performs this host I/O in an executor. A source edit produces a
    new immutable root; atomically publishing avoids half-written runtime scans.
    Symlinks are excluded like the source package catalog.
    """
    files: list[tuple[Path, bytes]] = []
    digest = hashlib.sha256()
    for slug in sorted(slugs):
        skill_dir = source / slug
        for path in sorted(skill_dir.rglob("*")):
            relative = path.relative_to(source)
            if path.is_symlink() or not path.is_file():
                continue
            if any(parent.is_symlink() for parent in path.parents if parent != source):
                continue
            content = path.read_bytes()
            name = relative.as_posix().encode("utf-8")
            digest.update(len(name).to_bytes(8))
            digest.update(name)
            digest.update(len(content).to_bytes(8))
            digest.update(content)
            files.append((relative, content))
    target = cache_root / digest.hexdigest()
    if target.is_dir():
        return target
    cache_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=cache_root, prefix=".building-") as temporary:
        staged = Path(temporary) / "skills"
        staged.mkdir()
        for relative, content in files:
            destination = staged / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(content)
        try:
            os.rename(staged, target)
        except OSError:
            # Concurrent agents for one owner can build the identical selection.
            if not target.is_dir():
                raise
    return target
