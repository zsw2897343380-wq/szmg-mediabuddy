"""User-owned installation state for the shared skill-package catalog."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING

from octop.infra.errors import ErrorCode, OctopError

if TYPE_CHECKING:
    from octop.infra.db.repos.settings import SettingsRepo
    from octop.infra.db.repos.skill_packages import SkillPackageRepo


@dataclass
class UserSkillPreference:
    installed: bool
    enabled: bool = True


@dataclass
class UserSkillLibraryState:
    installed_package_ids: list[str] = field(default_factory=list)
    disabled_package_ids: list[str] = field(default_factory=list)

    skill_states: dict[str, dict[str, UserSkillPreference]] = field(default_factory=dict)

    def allows(self, package_id: str, slug: str, *, legacy: bool = False) -> bool:
        override = self.skill_states.get(package_id, {}).get(slug)
        if override is not None:
            return override.installed and override.enabled
        if package_id in self.disabled_package_ids:
            return False
        return legacy or package_id in self.installed_package_ids

    @property
    def enabled_package_ids(self) -> list[str]:
        disabled = set(self.disabled_package_ids)
        return [item for item in self.installed_package_ids if item not in disabled]


class UserSkillLibrary:
    """Keep installation and enablement separate from every agent's profile.

    Package content keeps its existing instance-wide sharing policy. Only this
    user's install/enable preferences are private; no workspace files are copied.
    """

    def __init__(self, *, settings: SettingsRepo, packages: SkillPackageRepo) -> None:
        self._settings = settings
        self._packages = packages

    def load(self, user_id: int) -> UserSkillLibraryState:
        raw = self._settings.get(self._key(user_id))
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {}
        if not isinstance(data, dict):
            data = {}
        installed = self._ids(data.get("installed_package_ids"))
        installed = [item for item in installed if self._packages.get(item) is not None]
        disabled = self._ids(data.get("disabled_package_ids"))
        overrides: dict[str, dict[str, UserSkillPreference]] = {}
        raw_states = data.get("skill_states")
        if isinstance(raw_states, dict):
            for package_id, skills in raw_states.items():
                if self._packages.get(package_id) is None or not isinstance(skills, dict):
                    continue
                overrides[package_id] = {
                    slug: UserSkillPreference(
                        installed=bool(pref.get("installed")),
                        enabled=bool(pref.get("enabled", True)),
                    )
                    for slug, pref in skills.items()
                    if isinstance(slug, str) and isinstance(pref, dict)
                }
        return UserSkillLibraryState(
            installed, [item for item in disabled if item in installed], overrides
        )

    def update(
        self,
        user_id: int,
        package_id: str,
        *,
        installed: bool,
        enabled: bool,
    ) -> UserSkillLibraryState:
        if installed and self._packages.get(package_id) is None:
            raise OctopError.localized(ErrorCode.SKILL_PACKAGE_NOT_FOUND)
        state = self.load(user_id)
        if installed and package_id not in state.installed_package_ids:
            state.installed_package_ids.append(package_id)
        if not installed:
            state.installed_package_ids = [
                item for item in state.installed_package_ids if item != package_id
            ]
        state.disabled_package_ids = [
            item for item in state.disabled_package_ids if item != package_id
        ]
        if installed and not enabled:
            state.disabled_package_ids.append(package_id)
        # An explicit package operation intentionally resets its per-skill overrides.
        state.skill_states.pop(package_id, None)
        self._save(user_id, state)
        return state

    def update_skill(
        self,
        user_id: int,
        package_id: str,
        slug: str,
        *,
        installed: bool,
        enabled: bool,
    ) -> UserSkillLibraryState:
        if self._packages.get(package_id) is None:
            raise OctopError.localized(ErrorCode.SKILL_PACKAGE_NOT_FOUND)
        state = self.load(user_id)
        state.skill_states.setdefault(package_id, {})[slug] = UserSkillPreference(
            installed, enabled
        )
        self._save(user_id, state)
        return state

    def _save(self, user_id: int, state: UserSkillLibraryState) -> None:
        self._settings.set(self._key(user_id), json.dumps(asdict(state)))

    @staticmethod
    def _key(user_id: int) -> str:
        return f"user_skill_library:{user_id}"

    @staticmethod
    def _ids(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return list(dict.fromkeys(item for item in value if isinstance(item, str) and item))
