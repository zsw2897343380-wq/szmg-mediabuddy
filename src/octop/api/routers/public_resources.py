"""Superadministrator publication controls for public resources."""

import asyncio
from dataclasses import asdict
from functools import partial
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from octop.api.deps import current_user, get_server, require_permission
from octop.api.routers.connectors import _connector_service
from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.permissions import user_has_permission
from octop.infra.users.public_resource_catalog import PublicResourceCatalog
from octop.infra.users.public_resources import PublicResourceType
from octop.infra.utils.locale import resolve_request_locale

router = APIRouter(prefix="/admin/public-resources")


class PublicResourceResponse(BaseModel):
    resource_type: PublicResourceType
    resource_id: str
    category: Literal["experts", "skills", "connectors"]
    name: str
    description: str
    enabled: bool


class PublicResourceUpdate(BaseModel):
    ids: list[str] = Field(
        min_length=1, description="Public resource identifiers to publish or withdraw."
    )
    enabled: bool


def _catalog(server: Any) -> PublicResourceCatalog:
    return PublicResourceCatalog(
        services=server.services,
        expert_catalog=server.expert_catalog,
        connectors=_connector_service(server),
    )


@router.get(
    "",
    summary="List public resources for platform administration",
    response_model=list[PublicResourceResponse],
)
async def list_public_resources(
    request: Request,
    server: Any = Depends(get_server),
    _: Any = Depends(require_permission("public_resources.view")),
) -> list[PublicResourceResponse]:
    if server.app_runtime is not None:
        await server.app_runtime.agent_registry.refresh_builtin_skill_inventory()
    rows = await asyncio.get_running_loop().run_in_executor(
        None, _catalog(server).list_resources, resolve_request_locale(request)
    )
    return [PublicResourceResponse(**asdict(row)) for row in rows]


@router.put(
    "/{resource_type}",
    summary="Publish or withdraw public resources",
    description="Requires publication permission for the resource category. Withdrawn public resources disappear from user catalogs and live public references stop working. Independent private copies are retained.",
    status_code=204,
)
async def update_public_resources(
    resource_type: PublicResourceType,
    body: PublicResourceUpdate,
    server: Any = Depends(get_server),
    user: Any = Depends(current_user),
) -> None:
    category = (
        "experts"
        if resource_type in {"expert_template", "published_expert", "shared_expert"}
        else "skills"
        if resource_type in {"builtin_skill", "package_skill"}
        else "connectors"
    )
    if not user_has_permission(user, f"public_resources.{category}"):
        raise OctopError(
            ErrorCode.FORBIDDEN,
            "permission required",
            details={"permission": f"public_resources.{category}"},
        )
    if resource_type == "builtin_skill" and server.app_runtime is not None:
        await server.app_runtime.agent_registry.refresh_builtin_skill_inventory()
    await asyncio.get_running_loop().run_in_executor(
        None, partial(_catalog(server).update, resource_type, body.ids, enabled=body.enabled)
    )
    if server.app_runtime is not None:
        await server.app_runtime.agent_registry.refresh_public_resources(resource_type, body.ids)
