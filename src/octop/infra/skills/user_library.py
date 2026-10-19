"""User-owned installation state for the shared skill-package catalog."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from octop.infra.errors import ErrorCode, OctopError

if TYPE_CHECKING:
    from octop.infra.db.repos.settings import SettingsRepo
    from octop.infra.db.repos.skill_packages import SkillPackageRepo


@dataclass
class UserSkillLibraryState:
    installed_package_ids: list[str] = field(default_factory=list)
    disabled_package_ids: list[str] = field(default_factory=list)

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
        return UserSkillLibraryState(installed, [item for item in disabled if item in installed])

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
        self._settings.set(
            self._key(user_id),
            json.dumps(
                {
                    "installed_package_ids": state.installed_package_ids,
                    "disabled_package_ids": state.disabled_package_ids,
                }
            ),
        )
        return state

    @staticmethod
    def _key(user_id: int) -> str:
        return f"user_skill_library:{user_id}"

    @staticmethod
    def _ids(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return list(dict.fromkeys(item for item in value if isinstance(item, str) and item))
