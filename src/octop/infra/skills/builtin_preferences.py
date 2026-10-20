"""Account-wide preferences for the skills shipped with Octop and its harness."""

from __future__ import annotations

import json
from functools import lru_cache
from importlib import resources
from typing import TYPE_CHECKING, Any

from octop.infra.agents.builtin_skills import RETIRED_BUILTIN_SKILLS
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.skills.presentation import apply_skill_presentation
from octop.infra.utils.frontmatter import parse_frontmatter
from octop.infra.utils.locale import Locale

if TYPE_CHECKING:
    from octop.infra.db.repos.settings import SettingsRepo


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
    return result


class BuiltinSkillPreferences:
    def __init__(self, settings: SettingsRepo) -> None:
        self._settings = settings

    def disabled(self, user_id: int) -> set[str]:
        raw = self._settings.get(f"user_builtin_skills_disabled:{user_id}")
        values = json.loads(raw) if raw else []
        return {value for value in values if isinstance(value, str)}

    def filter_keys(self, user_id: int) -> set[str]:
        return self.keys_for_slugs(self.disabled(user_id))

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
            apply_skill_presentation(
                {
                    "slug": slug,
                    "name": str(meta.get("name") or slug),
                    "description": str(meta.get("description") or ""),
                    "enabled": slug not in disabled,
                },
                meta,
                locale=locale,
            )
            for slug, meta in sorted(_manifests()[locale].items())
        ]

    def update(self, user_id: int, slugs: list[str], *, enabled: bool) -> None:
        known = set().union(*_manifests().values())
        if not set(slugs) <= known:
            raise OctopError.localized(ErrorCode.NOT_FOUND)
        disabled = self.disabled(user_id)
        if enabled:
            disabled.difference_update(slugs)
        else:
            disabled.update(slugs)
        self._settings.set(f"user_builtin_skills_disabled:{user_id}", json.dumps(sorted(disabled)))
