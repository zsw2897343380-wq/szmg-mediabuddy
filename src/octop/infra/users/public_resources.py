"""Platform publication policy, independent of personal install preferences."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Literal

from octop.infra.errors import ErrorCode, OctopError

if TYPE_CHECKING:
    from octop.infra.db.repos.settings import SettingsRepo

PublicResourceType = Literal[
    "expert_template",
    "published_expert",
    "shared_expert",
    "builtin_skill",
    "package_skill",
    "connector_catalog",
    "shared_connector",
]


class PublicResourcePolicy:
    def __init__(self, settings: SettingsRepo) -> None:
        self._settings = settings

    def disabled(self, resource_type: PublicResourceType) -> set[str]:
        value = self._settings.get(f"public_resources_disabled:{resource_type}")
        return set(json.loads(value)) if value else set()

    def allows(self, resource_type: PublicResourceType, resource_id: str) -> bool:
        return resource_id not in self.disabled(resource_type)

    def require(self, resource_type: PublicResourceType, resource_id: str) -> None:
        if not self.allows(resource_type, resource_id):
            raise OctopError.localized(ErrorCode.NOT_FOUND)

    def update(self, resource_type: PublicResourceType, ids: list[str], *, enabled: bool) -> None:
        disabled = self.disabled(resource_type)
        if enabled:
            disabled.difference_update(ids)
        else:
            disabled.update(ids)
        self._settings.set(
            f"public_resources_disabled:{resource_type}", json.dumps(sorted(disabled))
        )
