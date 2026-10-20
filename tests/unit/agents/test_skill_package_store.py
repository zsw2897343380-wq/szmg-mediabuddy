"""Tests for global skill package disk storage."""

from __future__ import annotations

import io
import shutil
import sqlite3
from pathlib import Path
from zipfile import ZipFile, ZipInfo

import pytest

from octop.infra.db.migrate import run_migrations
from octop.infra.db.pool import SqlitePool
from octop.infra.db.repos.skill_packages import SkillPackageRepo
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.skills.skill_package_store import SkillPackageStore
from octop.infra.users.identity import Role, User


@pytest.fixture
def db(tmp_path: Path) -> SqlitePool:
    pool = SqlitePool(tmp_path / "octop.db")
    run_migrations(pool)
    return pool


@pytest.fixture
def store(tmp_path: Path, db: SqlitePool) -> SkillPackageStore:
    return SkillPackageStore(
        repo=SkillPackageRepo(db),
        root=tmp_path / "skill-packages",
    )


def test_create_package_makes_skills_dir(store: SkillPackageStore) -> None:
    row = store.create(name="P", description="", created_by="42")

    assert len(row.id) == 6
    assert (store.root / row.id / "skills").is_dir()


def test_write_and_delete_skill_updates_disk_summaries_and_count(
    store: SkillPackageStore,
) -> None:
    row = store.create(name="P", description="", created_by="42")

    store.write_skill(
        row.id,
        "pdf",
        [
            (
                "SKILL.md",
                (
                    "---\nname: PDF\nmetadata:\n  octop:\n"
                    "    display_name: PDF Reader\n"
                    "    emoji: '📄'\n"
                    "    icon_url: https://cdn.example.com/pdf.png\n"
                    "---\nRead PDFs."
                ).encode(),
            ),
            ("references/guide.md", b"# Guide"),
        ],
    )

    assert (
        store.package_skills_dir(row.id) / "pdf" / "references" / "guide.md"
    ).read_bytes() == b"# Guide"
    assert store.list_skill_summaries(row.id) == [
        {
            "slug": "pdf",
            "name": "PDF",
            "description": "",
            "path": "skills/pdf/SKILL.md",
            "kind": "package",
            "package_id": row.id,
            "display_name": "PDF Reader",
            "emoji": "\U0001f4c4",
            "icon_url": "https://cdn.example.com/pdf.png",
        }
    ]
    assert store.repo.get(row.id).skill_count == 1

    store.delete_skill(row.id, "pdf")

    assert not (store.package_skills_dir(row.id) / "pdf").exists()
    assert store.list_skill_summaries(row.id) == []
    assert store.repo.get(row.id).skill_count == 0


@pytest.mark.parametrize(
    ("method", "slug", "files"),
    [
        ("write_skill", "../unsafe", [("SKILL.md", b"# skill")]),
        ("write_skill", "safe", [("../unsafe", b"bad")]),
        ("delete_skill", "../unsafe", None),
    ],
)
def test_skill_validation_errors_are_mapped_to_octop_errors(
    store: SkillPackageStore,
    method: str,
    slug: str,
    files: list[tuple[str, bytes]] | None,
) -> None:
    row = store.create(name="P", description="", created_by="42")

    with pytest.raises(OctopError) as exc_info:
        if method == "write_skill":
            assert files is not None
            store.write_skill(row.id, slug, files)
        else:
            store.delete_skill(row.id, slug)

    assert exc_info.value.code is ErrorCode.SLASH_BAD_ARGS


def test_write_skill_recreates_empty_directories(store: SkillPackageStore) -> None:
    row = store.create(name="P", description="", created_by="42")

    store.write_skill(
        row.id,
        "word-docx",
        [
            ("SKILL.md", b"---\nname: word-docx\n---\n"),
            ("ai/", b""),
            ("data/", b""),
            ("scripts/", b""),
            ("index.html", b"<html></html>"),
        ],
    )

    skill_dir = store.package_skills_dir(row.id) / "word-docx"
    assert skill_dir.is_dir()
    assert (skill_dir / "SKILL.md").read_bytes() == b"---\nname: word-docx\n---\n"
    assert (skill_dir / "index.html").read_bytes() == b"<html></html>"
    assert (skill_dir / "ai").is_dir()
    assert (skill_dir / "data").is_dir()
    assert (skill_dir / "scripts").is_dir()
    assert list((skill_dir / "ai").iterdir()) == []


def test_list_skill_summaries_localizes_octop_metadata(store: SkillPackageStore) -> None:
    row = store.create(name="P", description="", created_by="42")
    store.write_skill(
        row.id,
        "pdf-reader",
        [
            (
                "SKILL.md",
                (
                    "---\n"
                    "name: pdf-reader\n"
                    "description: Agent trigger\n"
                    "metadata:\n"
                    "  octop:\n"
                    "    label:\n"
                    "      zh: PDF 阅读\n"
                    "      en: PDF Reader\n"
                    "    summary:\n"
                    "      zh: 读取 PDF\n"
                    "      en: Read PDFs\n"
                    "---\n"
                ).encode(),
            )
        ],
    )

    zh = store.list_skill_summaries(row.id, locale="zh")[0]
    en = store.list_skill_summaries(row.id, locale="en")[0]

    assert (zh["name"], zh["description"]) == ("PDF 阅读", "读取 PDF")
    assert (en["name"], en["description"]) == ("PDF Reader", "Read PDFs")


def test_skill_count_excludes_skills_hidden_from_summaries(store: SkillPackageStore) -> None:
    row = store.create(name="P", description="", created_by="42")
    skills_dir = store.package_skills_dir(row.id)
    (skills_dir / "missing-manifest").mkdir()
    hidden = skills_dir / "hidden"
    hidden.mkdir()
    (hidden / "SKILL.md").write_text("---\nremoved: true\n---\n", encoding="utf-8")

    store.write_skill(row.id, "visible", [("SKILL.md", b"# visible")])

    assert [summary["slug"] for summary in store.list_skill_summaries(row.id)] == ["visible"]
    assert store.repo.get(row.id).skill_count == 1


def test_delete_package_removes_database_row_and_directory(
    store: SkillPackageStore,
) -> None:
    row = store.create(name="P", description="", created_by="42")

    store.delete_package(row.id)

    assert store.repo.get(row.id) is None
    assert not (store.root / row.id).exists()


def test_assert_can_mutate_allows_creator_and_admin_only(
    store: SkillPackageStore,
) -> None:
    row = store.create(name="P", description="", created_by="42")
    creator = User(id=42, username="creator", role=Role.USER, display_name=None)
    other = User(id=7, username="other", role=Role.USER, display_name=None)
    admin = User(id=1, username="admin", role=Role.ADMIN, display_name=None)

    store.assert_can_mutate(row, creator)
    store.assert_can_mutate(row, admin)

    with pytest.raises(OctopError) as exc_info:
        store.assert_can_mutate(row, other)
    assert exc_info.value.code is ErrorCode.FORBIDDEN


def test_database_restores_complete_package_into_a_fresh_cache(store: SkillPackageStore) -> None:
    row = store.create(name="Complete", description="Keep metadata", created_by="42")
    files = [
        ("SKILL.md", "---\nname: 中文技能\n---\n完整正文".encode()),
        ("scripts/tool.py", b"print('hello')\n"),
        ("assets/icon.png", b"\x89PNG\x00\xff"),
        ("empty/", b""),
    ]
    store.write_skill(row.id, "complete", files)
    before = store.repo.get(row.id)
    fresh = SkillPackageStore(repo=store.repo, root=store.root.parent / "fresh-cache")
    fresh.initialize_snapshots()
    restored = fresh.package_skills_dir(row.id) / "complete"
    for path, content in files:
        if path.endswith("/"):
            assert (restored / path).is_dir()
        else:
            assert (restored / path).read_bytes() == content
    assert fresh.repo.get(row.id) == before


def test_startup_adopts_legacy_files_without_changing_metadata(store: SkillPackageStore) -> None:
    row = store.repo.create(id="legacy", name="Legacy", created_by="42")
    directory = store.root / row.id / "skills" / "old"
    directory.mkdir(parents=True)
    (directory / "SKILL.md").write_bytes(b"# Original legacy skill")
    store.initialize_snapshots()
    assert store.repo.get(row.id) == row
    shutil.rmtree(store.root)
    store.initialize_snapshots()
    assert (
        store.package_skills_dir(row.id) / "old" / "SKILL.md"
    ).read_bytes() == b"# Original legacy skill"
    assert store.repo.get(row.id) == row


def test_updates_and_deletions_survive_complete_cache_loss(store: SkillPackageStore) -> None:
    row = store.create(name="Mutable", description="", created_by="42")
    store.write_skill(row.id, "one", [("SKILL.md", b"# Before")])
    store.write_skill(row.id, "two", [("SKILL.md", b"# Two")])
    store.write_skill(row.id, "one", [("SKILL.md", b"# After"), ("asset.bin", b"\x00\xff")])
    shutil.rmtree(store.root)
    assert (store.package_skills_dir(row.id) / "one" / "SKILL.md").read_bytes() == b"# After"
    assert (store.package_skills_dir(row.id) / "one" / "asset.bin").read_bytes() == b"\x00\xff"
    store.delete_skill(row.id, "one")
    shutil.rmtree(store.root)
    assert [s["slug"] for s in store.list_skill_summaries(row.id)] == ["two"]
    assert store.repo.get(row.id).skill_count == 1
    store.delete_skill(row.id, "two")
    shutil.rmtree(store.root)
    assert store.list_skill_summaries(row.id) == []
    assert store.repo.get(row.id).skill_count == 0


def test_database_failure_preserves_previous_files_and_count(
    store: SkillPackageStore, monkeypatch
) -> None:
    row = store.create(name="Rollback", description="", created_by="42")
    store.write_skill(row.id, "one", [("SKILL.md", b"# Original")])
    before = store.repo.get(row.id)
    archive = store.repo.get_snapshot_archive(row.id)

    def fail(*args, **kwargs):
        raise sqlite3.OperationalError("simulated database failure")

    monkeypatch.setattr(store.repo, "save_snapshot", fail)
    with pytest.raises(sqlite3.OperationalError):
        store.write_skill(row.id, "two", [("SKILL.md", b"# New")])
    assert store.repo.get(row.id) == before
    assert store.repo.get_snapshot_archive(row.id) == archive
    assert [s["slug"] for s in store.list_skill_summaries(row.id)] == ["one"]


def test_conflicting_writer_is_merged_from_the_latest_database_snapshot(
    store: SkillPackageStore, db: SqlitePool, monkeypatch
) -> None:
    row = store.create(name="Concurrent", description="", created_by="42")
    store.write_skill(row.id, "original", [("SKILL.md", b"# Original")])
    other = SkillPackageStore(repo=SkillPackageRepo(db), root=store.root.parent / "other-cache")
    save = store.repo.save_snapshot
    raced = False

    def save_after_other_writer(*args, **kwargs):
        nonlocal raced
        if not raced:
            raced = True
            other.write_skill(row.id, "other", [("SKILL.md", b"# Other")])
        return save(*args, **kwargs)

    monkeypatch.setattr(store.repo, "save_snapshot", save_after_other_writer)
    store.write_skill(row.id, "new", [("SKILL.md", b"# New")])
    shutil.rmtree(store.root)
    assert {s["slug"] for s in store.list_skill_summaries(row.id)} == {"original", "other", "new"}
    assert store.repo.get(row.id).skill_count == 3


def test_committed_files_recover_after_cache_swap_failure(
    store: SkillPackageStore, monkeypatch
) -> None:
    from octop.infra.skills import skill_package_store

    row = store.create(name="Cache failure", description="", created_by="42")
    store.write_skill(row.id, "one", [("SKILL.md", b"# Before")])

    def fail(*args, **kwargs):
        raise OSError("simulated cache failure")

    monkeypatch.setattr(skill_package_store, "replace_directory", fail)
    with pytest.raises(OSError):
        store.write_skill(row.id, "one", [("SKILL.md", b"# Committed")])
    assert (store.package_skills_dir(row.id) / "one" / "SKILL.md").read_bytes() == b"# Committed"


@pytest.mark.parametrize("path", ["../escape", "/escape", "C:/escape", "bad\\escape"])
def test_restoration_rejects_unsafe_archive_paths(store: SkillPackageStore, path: str) -> None:
    row = store.repo.create(id="unsafe", name="Unsafe", created_by="42")
    archive = io.BytesIO()
    with ZipFile(archive, "w") as packed:
        entry = ZipInfo("placeholder")
        # ZipInfo normalizes Windows separators in its constructor.
        entry.filename = path
        packed.writestr(entry, b"unsafe")
    assert store.repo.save_snapshot(row.id, archive.getvalue(), expected_digest=None)
    with pytest.raises(ValueError, match="archive path"):
        store.initialize_snapshots()
    assert not (store.root / row.id / "skills").exists()
    assert not (store.root / "escape").exists()


def test_snapshot_compare_and_swap_and_package_cascade(store: SkillPackageStore) -> None:
    row = store.create(name="CAS", description="", created_by="42")
    store.write_skill(row.id, "one", [("SKILL.md", b"# One")])
    digest = store.repo.get_snapshot_digest(row.id)
    before = store.repo.get(row.id)
    assert not store.repo.save_snapshot(
        row.id, b"wrong", expected_digest="outdated", skill_count=99
    )
    assert store.repo.get_snapshot_digest(row.id) == digest
    assert store.repo.get(row.id) == before
    store.delete_package(row.id)
    assert store.repo.get_snapshot_archive(row.id) is None
