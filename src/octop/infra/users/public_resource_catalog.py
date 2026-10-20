"""Inventory used by the administrator's publication controls."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from octop.infra.connectors.catalog import list_catalog
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.skills.builtin_preferences import BuiltinSkillPreferences
from octop.infra.skills.skill_package_store import SkillPackageStore
from octop.infra.users.public_resources import PublicResourcePolicy, PublicResourceType
from octop.infra.utils.locale import Locale


@dataclass
class PublicResource:
    resource_type: PublicResourceType
    resource_id: str
    category: Literal["experts", "skills", "connectors"]
    name: str
    description: str
    enabled: bool = True


class PublicResourceCatalog:
    def __init__(self, *, services: Any, expert_catalog: Any, connectors: Any) -> None:
        self.services = services
        self.experts = expert_catalog
        self.connectors = connectors
        self.policy = PublicResourcePolicy(services.settings_repo)

    def list_resources(self, locale: Locale) -> list[PublicResource]:
        rows: list[PublicResource] = []
        if self.experts is not None:
            for item in self.experts.list_summaries():
                rows.append(
                    PublicResource(
                        "expert_template",
                        item.id,
                        "experts",
                        item.label_zh if locale == "zh" else item.label_en,
                        item.description_zh if locale == "zh" else item.description_en,
                    )
                )
        for item in self.services.published_expert_repo.list_all():
            rows.append(
                PublicResource("published_expert", item.id, "experts", item.name, item.description)
            )
        for item in self.services.agent_repo.list_shared():
            rows.append(
                PublicResource(
                    "shared_expert", item.agent_id, "experts", item.name, item.description or ""
                )
            )
        for skill in BuiltinSkillPreferences(self.services.settings_repo).list_skills(0, locale):
            rows.append(
                PublicResource(
                    "builtin_skill", skill["slug"], "skills", skill["name"], skill["description"]
                )
            )
        store = SkillPackageStore(
            repo=self.services.skill_package_repo, root=self.services.paths.skill_packages_dir
        )
        for package in store.repo.list_all():
            for skill in store.list_skill_summaries(package.id, locale=locale):
                rows.append(
                    PublicResource(
                        "package_skill",
                        f"{package.id}/{skill['slug']}",
                        "skills",
                        skill["name"],
                        f"{package.name} · {skill['description']}",
                    )
                )
        for entry in list_catalog():
            rows.append(
                PublicResource(
                    "connector_catalog",
                    entry.kind,
                    "connectors",
                    entry.name.resolve(locale),
                    entry.description.resolve(locale),
                )
            )
        for item in self.connectors.list_instances_for_api(-1, include_disabled_public=True):
            if item.get("shared"):
                rows.append(
                    PublicResource(
                        "shared_connector",
                        item["instance_id"],
                        "connectors",
                        item["display_name"],
                        item.get("description") or item["kind"],
                    )
                )
        for row in rows:
            row.enabled = self.policy.allows(row.resource_type, row.resource_id)
        return rows

    def update(self, resource_type: PublicResourceType, ids: list[str], *, enabled: bool) -> None:
        known = {
            row.resource_id
            for row in self.list_resources("en")
            if row.resource_type == resource_type
        }
        if not set(ids) <= known:
            raise OctopError.localized(ErrorCode.NOT_FOUND)
        self.policy.update(resource_type, ids, enabled=enabled)
