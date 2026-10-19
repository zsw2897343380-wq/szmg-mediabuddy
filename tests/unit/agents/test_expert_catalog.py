"""Tests for ExpertCatalog workspace discovery and lazy file reads."""

from __future__ import annotations

import json
from pathlib import Path

import pytest


def _write_manifest(expert_dir: Path, *, extra: dict | None = None) -> None:
    payload: dict = {
        "id": expert_dir.name,
        "label": {"zh": "测试", "en": "Test"},
        "description": {"zh": "desc", "en": "desc"},
    }
    if extra:
        payload.update(extra)
    (expert_dir / "manifest.json").write_text(
        json.dumps(payload, ensure_ascii=False),
        encoding="utf-8",
    )


def test_expert_discovers_seed_paths(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog

    expert_dir = tmp_path / "my-expert"
    expert_dir.mkdir()
    _write_manifest(expert_dir)
    (expert_dir / "SOUL.md").write_text("# Soul\nhello", encoding="utf-8")
    skill = expert_dir / "skills" / "my-skill" / "SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("# Skill", encoding="utf-8")

    catalog = ExpertCatalog(tmp_path)
    catalog.refresh()

    expert = catalog.get("my-expert")
    assert expert is not None
    assert "SOUL.md" in expert.files
    assert "skills/my-skill/SKILL.md" in expert.files
    assert expert.prompt_files == []


def test_resolve_expert_icon_url_uses_scene_for_skillhub() -> None:
    from octop.infra.agents.experts.catalog import resolve_expert_icon_url

    assert (
        resolve_expert_icon_url(
            "skillhub-skillset-healthcare-nursing-plan",
            None,
            scene="healthcare",
        )
        == "/experts/avatars/scene-healthcare.svg"
    )
    # Do not invent missing per-skillset SVG paths.
    assert (
        resolve_expert_icon_url(
            "skillhub-skillset-healthcare-nursing-plan",
            "/experts/avatars/skillhub-skillset-healthcare-nursing-plan.svg",
            scene="healthcare",
        )
        == "/experts/avatars/scene-healthcare.svg"
    )
    assert resolve_expert_icon_url("stock-assistant", None) == (
        "/experts/avatars/stock-assistant.svg"
    )
    assert resolve_expert_icon_url(
        "external",
        "https://cdn.example.com/a.png",
    ) == ("https://cdn.example.com/a.png")


def test_bundled_avatar_ids_discovered_from_public_dir() -> None:
    from octop.infra.agents.experts.catalog import (
        _BUNDLED_AVATAR_IDS,
        bundled_avatars_dir,
        discover_bundled_avatar_ids,
    )

    avatars = bundled_avatars_dir()
    assert avatars is not None
    discovered = discover_bundled_avatar_ids(avatars)
    assert "stock-assistant" in discovered
    assert "scene-healthcare" in discovered
    assert discovered == _BUNDLED_AVATAR_IDS
    # Empty / missing dir falls back without crashing.
    assert "scene-default" in discover_bundled_avatar_ids(avatars / "missing")


def test_skillhub_market_manifest_gets_scene_icon_url(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog

    market_root = tmp_path / "market"
    expert_dir = market_root / "skillhub-skillset-healthcare-nursing-plan"
    expert_dir.mkdir(parents=True)
    _write_manifest(
        expert_dir,
        extra={
            "id": "skillhub-skillset-healthcare-nursing-plan",
            "icon_name": "heart",
            "source": {"type": "skillhub", "scene": "healthcare"},
        },
    )

    catalog = ExpertCatalog(tmp_path / "bundled", extra_roots=[market_root])
    (tmp_path / "bundled").mkdir()
    catalog.refresh()

    expert = catalog.get("skillhub-skillset-healthcare-nursing-plan")
    assert expert is not None
    assert expert.summary.icon_url == "/experts/avatars/scene-healthcare.svg"


def test_expert_catalog_reads_extra_roots(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog

    bundled_root = tmp_path / "bundled"
    market_root = tmp_path / "market"
    bundled_dir = bundled_root / "bundled-expert"
    market_dir = market_root / "market-expert"
    bundled_dir.mkdir(parents=True)
    market_dir.mkdir(parents=True)
    _write_manifest(bundled_dir)
    _write_manifest(market_dir)
    (market_dir / "SOUL.md").write_text("# Market soul", encoding="utf-8")

    catalog = ExpertCatalog(bundled_root, extra_roots=[market_root])
    catalog.refresh()

    assert catalog.get("bundled-expert") is not None
    assert catalog.get("market-expert") is not None
    # Library UI lists only bundled templates; market cache stays resolvable via get().
    assert [s.id for s in catalog.list_summaries()] == ["bundled-expert"]
    assert [s.id for s in catalog.list_summaries(include_market_cache=True)] == [
        "bundled-expert",
        "market-expert",
    ]
    market = catalog.get("market-expert")
    assert market is not None
    assert catalog.expert_dir("market-expert") == market_dir
    assert "SOUL.md" in market.files


def test_expert_lazy_read_file_contents(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog

    expert_dir = tmp_path / "my-expert"
    expert_dir.mkdir()
    _write_manifest(expert_dir, extra={"prompt_files": ["SOUL.md"]})
    (expert_dir / "SOUL.md").write_text("# Soul\nhello", encoding="utf-8")
    (expert_dir / "extra.md").write_text("also copied", encoding="utf-8")

    catalog = ExpertCatalog(tmp_path)
    catalog.refresh()

    expert = catalog.get("my-expert")
    assert expert is not None
    assert expert.prompt_files == ["SOUL.md"]
    contents = {item["name"]: item["content"] for item in catalog.read_file_contents("my-expert")}
    assert contents["SOUL.md"] == "# Soul\nhello"
    assert contents["extra.md"] == "also copied"
    assert "manifest.json" not in expert.files


def test_preview_file_paths_limits_dashboard_preview(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog, preview_file_paths

    expert_dir = tmp_path / "my-expert"
    expert_dir.mkdir()
    _write_manifest(expert_dir, extra={"prompt_files": ["SOUL.md"]})
    (expert_dir / "SOUL.md").write_text("# Soul\nhello", encoding="utf-8")
    (expert_dir / "BOOTSTRAP.md").write_text("bootstrap", encoding="utf-8")
    (expert_dir / "references" / "cron-presets.json").parent.mkdir(parents=True)
    (expert_dir / "references" / "cron-presets.json").write_text("{}", encoding="utf-8")
    skill = expert_dir / "skills" / "my-skill" / "SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("# Skill", encoding="utf-8")
    agents_dir = expert_dir / "agents"
    agents_dir.mkdir()
    (agents_dir / "reviewer.md").write_text(
        "---\nname: Reviewer\ndescription: Code review\n---\n\n# Reviewer\n",
        encoding="utf-8",
    )

    catalog = ExpertCatalog(tmp_path)
    catalog.refresh()

    expert = catalog.get("my-expert")
    assert expert is not None
    preview = preview_file_paths(expert)
    assert preview == [
        "SOUL.md",
        "skills/my-skill/SKILL.md",
        "agents/reviewer.md",
    ]
    names = {item["name"] for item in catalog.read_file_contents("my-expert", paths=preview)}
    assert names == {"SOUL.md", "skills/my-skill/SKILL.md", "agents/reviewer.md"}


def test_preview_paths_skip_manifest_json_in_prompt_files(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import preview_paths_from_inventory

    paths = preview_paths_from_inventory(
        ["SOUL.md", "manifest.json"],
        ["skills/demo/SKILL.md"],
    )
    assert paths == ["SOUL.md", "skills/demo/SKILL.md"]


def test_expert_prompt_files_metadata_only(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog

    expert_dir = tmp_path / "my-expert"
    expert_dir.mkdir()
    _write_manifest(expert_dir, extra={"prompt_files": ["SOUL.md"]})
    (expert_dir / "SOUL.md").write_text("# Soul\nhello", encoding="utf-8")
    skill = expert_dir / "skills" / "my-skill" / "SKILL.md"
    skill.parent.mkdir(parents=True)
    skill.write_text("# Skill\n" + ("x" * 5000), encoding="utf-8")

    catalog = ExpertCatalog(tmp_path)
    catalog.refresh()

    expert = catalog.get("my-expert")
    assert expert is not None
    assert expert.prompt_files == ["SOUL.md"]
    skill_body = next(
        item["content"]
        for item in catalog.read_file_contents("my-expert")
        if item["name"] == "skills/my-skill/SKILL.md"
    )
    assert skill_body.startswith("# Skill")


def test_bundled_default_expert_only_has_agents_md() -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog, default_library_root

    catalog = ExpertCatalog(default_library_root())
    catalog.refresh()
    expert = catalog.get("default")
    assert expert is not None
    assert expert.prompt_files == ["AGENTS.md"]
    assert expert.files == ["AGENTS.md"]
    names = {item["name"] for item in catalog.read_file_contents("default")}
    assert names == {"AGENTS.md"}


def test_bundled_office_automation_discovers_skills() -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog, default_library_root

    catalog = ExpertCatalog(default_library_root())
    catalog.refresh()
    expert = catalog.get("office-automation")
    assert expert is not None
    assert expert.prompt_files
    assert len(expert.files) > 50
    names = {item["name"] for item in catalog.read_file_contents("office-automation")}
    assert "skills/docx/SKILL.md" in names
    docx_skill = next(
        item["content"]
        for item in catalog.read_file_contents("office-automation")
        if item["name"] == "skills/docx/SKILL.md"
    )
    assert "DOCX" in docx_skill


def test_mediabuddy_collection_replaces_discovery_without_removing_legacy_templates() -> None:
    from collections import Counter

    from octop.infra.agents.experts.catalog import ExpertCatalog, default_library_root

    root = default_library_root()
    collection = json.loads((root / "mediabuddy.json").read_text(encoding="utf-8"))
    catalog = ExpertCatalog(root)
    catalog.refresh()
    summaries = catalog.list_summaries()
    assert len(summaries) == 40
    assert [item.id for item in summaries] == [
        "general-assistant",
        *(item["id"] for item in collection["experts"]),
    ]
    assert Counter(item.category for item in summaries[1:]) == {
        "topic-planning": 7,
        "article-production": 8,
        "viral-creation": 6,
        "international-communication": 5,
        "content-operations": 3,
        "data-analysis": 6,
        "office-collaboration": 1,
        "review-proofreading": 3,
    }
    assert collection["source"]["sha256"] == (
        "9934b0afec81f4aa776974dd434434d94901adde0adbd685d329d567c7c5e0bc"
    )
    assert summaries[1].label_zh == "资深GEO策略架构师"
    assert summaries[-1].label_zh == "音频剪辑专家"
    # Existing installations still resolve their old template and seed files.
    assert catalog.get("default") is not None
    assert catalog.get("ai-coding-coach") is not None
    assert catalog.get("clinical-learning-subscription") is not None
    assert catalog.get("office-automation") is not None
    visible_ids = {item.id for item in catalog.list_summaries(include_market_cache=True)}
    assert "ai-coding-coach" not in visible_ids
    assert "default" not in visible_ids


def test_all_media_roles_retain_source_descriptions_and_workflow() -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog, default_library_root

    root = default_library_root()
    collection = json.loads((root / "mediabuddy.json").read_text(encoding="utf-8"))
    catalog = ExpertCatalog(root)
    catalog.refresh()
    for item in collection["experts"]:
        expert = catalog.get(item["id"])
        assert expert is not None
        assert expert.summary.label_zh == item["name"]
        assert expert.summary.description_zh == item["description"]
        assert expert.summary.category == item["category"]
        assert expert.summary.discovery_order == item["order"]
        assert expert.files == ["SOUL.md"]
        assert expert.prompt_files == ["SOUL.md"]
        soul = catalog.read_file_contents(item["id"])[0]["content"]
        assert item["description"] in soul
        assert all(step in soul for step in item["workflow"])
        assert all(tag in soul for tag in item["tags"])
        # Role metadata must not masquerade as a real platform/tool connection.
        assert "不是源站公开的原始系统提示词" in soul
        assert "当前已授权且可用的工具" in soul


@pytest.mark.parametrize(
    "expert_id",
    ["media-fact-checker", "media-domestic-topic-planner", "media-bilingual-news-editor"],
)
async def test_media_role_seeds_real_workspace(tmp_path: Path, expert_id: str) -> None:
    from deepagents.backends.local_shell import LocalShellBackend
    from octop_harness.backends.workspace import BackendWorkspace

    from octop.infra.agents.experts.catalog import (
        WORKSPACE_MANIFEST_PATH,
        ExpertCatalog,
        default_library_root,
        seed_expert_directory,
    )

    catalog = ExpertCatalog(default_library_root())
    catalog.refresh()
    workspace = BackendWorkspace(
        LocalShellBackend(root_dir=str(tmp_path), virtual_mode=False), tmp_path
    )
    count = await seed_expert_directory(
        expert_dir=catalog.expert_dir(expert_id), workspace=workspace
    )
    assert count == 2
    manifest_text = await workspace.aread_text(WORKSPACE_MANIFEST_PATH)
    assert manifest_text is not None
    manifest = json.loads(manifest_text)
    assert manifest["id"] == expert_id
    assert manifest["category"]
    soul = await workspace.aread_text("SOUL.md")
    assert soul is not None
    assert manifest["description"]["zh"] in soul


def test_custom_catalog_is_not_restricted_to_mediabuddy_collection(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog

    expert_dir = tmp_path / "custom-role"
    expert_dir.mkdir()
    _write_manifest(expert_dir, extra={"category": "my-category"})
    catalog = ExpertCatalog(tmp_path)
    catalog.refresh()
    assert [(item.id, item.category) for item in catalog.list_summaries()] == [
        ("custom-role", "my-category")
    ]


def test_expert_quick_prompts_from_manifest(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog

    expert_dir = tmp_path / "my-expert"
    expert_dir.mkdir()
    _write_manifest(
        expert_dir,
        extra={
            "prompt_files": ["SOUL.md"],
            "quick_prompts": [
                {
                    "title": {"zh": "标题", "en": "Title"},
                    "description": {"zh": "说明", "en": "Desc"},
                    "prompt": {"zh": "你好", "en": "Hello"},
                    "color": "#abcdef",
                    "icon_name": "zap",
                }
            ],
        },
    )
    (expert_dir / "SOUL.md").write_text("soul", encoding="utf-8")

    catalog = ExpertCatalog(tmp_path)
    catalog.refresh()

    expert = catalog.get("my-expert")
    assert expert is not None
    assert len(expert.quick_prompts) == 1
    assert expert.quick_prompts[0].title_zh == "标题"
    assert expert.quick_prompts[0].prompt_en == "Hello"


def test_expert_task_examples_from_manifest(tmp_path: Path) -> None:
    from octop.infra.agents.experts.catalog import ExpertCatalog

    expert_dir = tmp_path / "my-expert"
    expert_dir.mkdir()
    _write_manifest(
        expert_dir,
        extra={
            "task_examples": {
                "zh": ["一", "二", "三", "四", "五"],
                "en": ["a", "b", "c", "d", "e"],
            }
        },
    )

    catalog = ExpertCatalog(tmp_path)
    catalog.refresh()
    expert = catalog.get("my-expert")
    assert expert is not None
    assert expert.summary.task_examples == {
        "zh": ["一", "二", "三"],
        "en": ["a", "b", "c"],
    }


class _MemWorkspace:
    def __init__(self, files: dict[str, str] | None = None) -> None:
        self.files = dict(files or {})

    async def aread_text(self, rel: str) -> str | None:
        return self.files.get(rel)

    async def aupload_many(self, pairs: list[tuple[str, bytes]]) -> None:
        for rel, data in pairs:
            self.files[rel] = data.decode("utf-8")


@pytest.mark.asyncio
async def test_apply_workspace_quick_prompts_merges_and_filters() -> None:
    from octop.infra.agents.experts.catalog import (
        WORKSPACE_MANIFEST_PATH,
        apply_workspace_quick_prompts,
    )

    workspace = _MemWorkspace(
        {WORKSPACE_MANIFEST_PATH: json.dumps({"id": "demo", "quick_prompts": []})}
    )
    await apply_workspace_quick_prompts(
        workspace,
        [
            {
                "title": {"zh": "卡", "en": ""},
                "description": {"zh": "", "en": ""},
                "prompt": {"zh": "做这件事", "en": ""},
                "color": "#fff7ed",
                "icon_name": "zap",
            },
            {"title": {"zh": "", "en": ""}, "prompt": {"zh": "", "en": ""}},
        ],
    )
    data = json.loads(workspace.files[WORKSPACE_MANIFEST_PATH])
    assert data["id"] == "demo"
    assert len(data["quick_prompts"]) == 1
    assert data["quick_prompts"][0]["title"]["zh"] == "卡"


@pytest.mark.asyncio
async def test_apply_workspace_quick_prompts_refuses_invalid_json() -> None:
    from octop.infra.agents.experts.catalog import (
        WORKSPACE_MANIFEST_PATH,
        apply_workspace_quick_prompts,
    )
    from octop.infra.errors import ErrorCode, OctopError

    workspace = _MemWorkspace({WORKSPACE_MANIFEST_PATH: "{not-json"})
    with pytest.raises(OctopError) as exc:
        await apply_workspace_quick_prompts(workspace, [])
    assert exc.value.code is ErrorCode.SLASH_BAD_ARGS
