"""Target-account boundaries for delegated user administrators."""

from typing import Any

from octop.infra.errors import ErrorCode, OctopError
from octop.infra.users.identity import User


def assert_manageable_account(actor: User, target: Any) -> None:
    if str(target.role) == "admin" and not actor.is_admin:
        raise OctopError(ErrorCode.FORBIDDEN, "administrator account requires administrator")


def assert_admin_remains(target: Any, active_users: list[Any]) -> None:
    if str(target.role) == "admin" and not any(
        row.id != target.id and str(row.role) == "admin" and not row.disabled
        for row in active_users
    ):
        raise OctopError(ErrorCode.FORBIDDEN, "cannot remove the last active administrator")
