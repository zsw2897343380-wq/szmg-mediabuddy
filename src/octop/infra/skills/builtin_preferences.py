"""Account-wide preferences for the skills shipped with Octop and its harness."""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from importlib import resources
from threading import Lock
from typing import TYPE_CHECKING, Any

from octop.infra.agents.builtin_skills import RETIRED_BUILTIN_SKILLS
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.skills.presentation import apply_skill_presentation
from octop.infra.utils.frontmatter import parse_frontmatter
from octop.infra.utils.locale import Locale

if TYPE_CHECKING:
    from octop.infra.db.repos.settings import SettingsRepo


_RUNTIME_INVENTORY = "runtime_builtin_skill_inventory"
_INVENTORY_LOCK = Lock()
# Original general-assistant bootstrap copy, before the product-help expansion.
_LEGACY_GENERAL_ASSISTANT_SHA256 = (
    "dc9f9be61e1906f8c520b5f3914cad8b1531043451ee51703bc9ea54196b8108"
)


@lru_cache(maxsize=1)
def _general_assistant_manifest() -> str:
    return (
        resources.files("octop.infra.agents.experts")
        .joinpath("library/general-assistant/skills/octop-assistant/SKILL.md")
        .read_text(encoding="utf-8")
    )


def is_general_assistant_system_skill(slug: str, content: str | None) -> bool:
    """Recognize shipped seed copies; edited private replacements remain private."""
    if slug != "octop-assistant" or content is None:
        return False
    normalized = content.replace("\r\n", "\n")
    return normalized == _general_assistant_manifest().replace("\r\n", "\n") or (
        hashlib.sha256(normalized.encode("utf-8")).hexdigest() == _LEGACY_GENERAL_ASSISTANT_SHA256
    )


@lru_cache(maxsize=1)
def _manifests() -> dict[str, dict[str, dict[str, Any]]]:
    result: dict[str, dict[str, dict[str, Any]]] = {"zh": {}, "en": {}}
    harness = resources.files("octop_harness.builtin.skills")
    octop = resources.files("octop.infra.agents.builtin_skills")
    for locale, skills in result.items():
        for root in (harness.joinpath(locale), octop):
            for entry in root.iterdir():
                manifest = entry.joinpath("SKILL.md")
                if entry.name in RETIRED_BUILTIN_SKILLS or not manifest.is_file():
                    continue
                skills[entry.name] = parse_frontmatter(manifest.read_text(encoding="utf-8"))[0]
        skills["octop-assistant"] = parse_frontmatter(_general_assistant_manifest())[0]
    return result


class BuiltinSkillPreferences:
    def __init__(self, settings: SettingsRepo) -> None:
        self._settings = settings

    def disabled(self, user_id: int) -> set[str]:
        raw = self._settings.get(f"user_builtin_skills_disabled:{user_id}")
        values = json.loads(raw) if raw else []
        return {value for value in values if isinstance(value, str)}

    def register_runtime_skills(self, rows: list[dict[str, Any]]) -> None:
        """Remember legacy builtin metadata, never workspace/private skill content."""
        with _INVENTORY_LOCK:
            self._register_runtime_skills(rows)

    def _register_runtime_skills(self, rows: list[dict[str, Any]]) -> None:
        raw = self._settings.get(_RUNTIME_INVENTORY)
        inventory = json.loads(raw) if raw else {}
        before = dict(inventory)
        for row in rows:
            slug = str(row.get("slug") or "")
            if row.get("kind") != "builtin" or not slug or slug in RETIRED_BUILTIN_SKILLS:
                continue
            inventory[slug] = {
                key: row[key]
                for key in (
                    "slug",
                    "name",
                    "description",
                    "label",
                    "display_name",
                    "summary",
                    "emoji",
                    "icon_url",
                )
                if key in row
            }
        if inventory != before:
            self._settings.set(_RUNTIME_INVENTORY, json.dumps(inventory, ensure_ascii=False))

    def _summaries(self, locale: Locale) -> dict[str, dict[str, Any]]:
        from octop.infra.skills.presentation import localize_skill_summary

        summaries = {
            slug: apply_skill_presentation(
                {
                    "slug": slug,
                    "name": str(meta.get("name") or slug),
                    "description": str(meta.get("description") or ""),
                },
                meta,
                locale=locale,
            )
            for slug, meta in _manifests()[locale].items()
        }
        raw = self._settings.get(_RUNTIME_INVENTORY)
        for slug, row in (json.loads(raw) if raw else {}).items():
            summaries[slug] = localize_skill_summary(row, locale)
        return summaries

    def filter_keys(self, user_id: int) -> set[str]:
        return self.registered_filter_keys(self.disabled(user_id))

    def registered_filter_keys(self, slugs: set[str]) -> set[str]:
        keys = self.keys_for_slugs(slugs)
        raw = self._settings.get(_RUNTIME_INVENTORY)
        for slug, row in (json.loads(raw) if raw else {}).items():
            if slug in slugs:
                keys.add(str(row.get("name") or slug))
        return keys

    @staticmethod
    def keys_for_slugs(slugs: set[str]) -> set[str]:
        keys = set(slugs)
        for skills in _manifests().values():
            keys.update(
                str(meta.get("name") or slug) for slug, meta in skills.items() if slug in slugs
            )
        return keys

    def list_skills(self, user_id: int, locale: Locale) -> list[dict[str, Any]]:
        disabled = self.disabled(user_id)
        return [
            {**summary, "enabled": slug not in disabled}
            for slug, summary in sorted(self._summaries(locale).items())
        ]

    def update(self, user_id: int, slugs: list[str], *, enabled: bool) -> None:
        known = set(self._summaries("en"))
        if not set(slugs) <= known:
            raise OctopError.localized(ErrorCode.NOT_FOUND)
        disabled = self.disabled(user_id)
        if enabled:
            disabled.difference_update(slugs)
        else:
            disabled.update(slugs)
        self._settings.set(f"user_builtin_skills_disabled:{user_id}", json.dumps(sorted(disabled)))
