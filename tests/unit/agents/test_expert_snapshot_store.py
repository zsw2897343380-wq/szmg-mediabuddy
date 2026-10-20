from __future__ import annotations

import io
import shutil
from pathlib import Path
from types import SimpleNamespace
from zipfile import ZipFile

import pytest

from octop.infra.agents.experts.snapshot_store import (
    initialize_published_snapshots,
    published_snapshot_dir,
    snapshot_archive,
)
from octop.infra.db.migrate import run_migrations
from octop.infra.db.pool import SqlitePool
from octop.infra.db.repos.published_experts import PublishedExpertRepo


@pytest.fixture
def services(tmp_path: Path) -> SimpleNamespace:
    db = SqlitePool(tmp_path / "db.sqlite")
    run_migrations(db)
    repo = PublishedExpertRepo(db)
    repo.create(id="expert", slug="expert", name="Expert", created_by="1")
    return SimpleNamespace(
        published_expert_repo=repo,
        paths=SimpleNamespace(published_experts_dir=tmp_path / "snapshots"),
    )


def test_legacy_backfill_and_cache_loss_preserve_every_file(services: SimpleNamespace) -> None:
    dest = services.paths.published_experts_dir / "expert"
    dest.mkdir(parents=True)
    files = {
        "manifest.json": b'{"category":"article-production"}',
        "SOUL.md": "新闻编辑".encode(),
        ".octop/avatar.png": b"binary\x00\xff",
        "skills/news/SKILL.md": b"news skill",
    }
    for rel, content in files.items():
        path = dest / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    initialize_published_snapshots(services)
    assert published_snapshot_dir(services, "expert") == dest
    archive = services.published_expert_repo.get_snapshot_archive("expert")
    assert archive is not None
    shutil.rmtree(services.paths.published_experts_dir)
    initialize_published_snapshots(services)
    assert published_snapshot_dir(services, "expert") == dest
    assert all((dest / rel).read_bytes() == content for rel, content in files.items())
    with ZipFile(io.BytesIO(archive)) as packed:
        assert set(packed.namelist()) == set(files)
    # Another container's refresh must invalidate this container's old cache.
    source = dest.parent / "refreshed"
    source.mkdir()
    (source / "manifest.json").write_text("{}")
    (source / "SOUL.md").write_text("new persona")
    services.published_expert_repo.update_snapshot_meta(
        "expert", snapshot_archive=snapshot_archive(source)
    )
    published_snapshot_dir(services, "expert")
    assert (dest / "SOUL.md").read_text() == "new persona"
    assert not (dest / "skills/news/SKILL.md").exists()


@pytest.mark.parametrize("name", ["../escape", "/absolute", "C:/outside", "dir\\..\\..\\outside"])
def test_archive_cannot_write_outside_cache(services: SimpleNamespace, name: str) -> None:
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(name, "unsafe")
    services.published_expert_repo.backfill_snapshot_archive("expert", buffer.getvalue())
    with pytest.raises(ValueError, match="Invalid published snapshot archive path"):
        published_snapshot_dir(services, "expert")
    assert not (services.paths.published_experts_dir / "expert").exists()
