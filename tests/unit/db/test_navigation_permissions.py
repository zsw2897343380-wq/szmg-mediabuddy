"""Restarting and upgrading never infer new grants from retired module names."""

import json
from pathlib import Path

from octop.infra.db.migrate import run_migrations
from octop.infra.db.pool import SqlitePool
from octop.infra.db.repos.user_roles import UserRoleRepo
from octop.infra.db.repos.users import UserRepo


def test_upgrade_does_not_backfill_navigation(tmp_path: Path) -> None:
    db = SqlitePool(tmp_path / "permissions.db")
    run_migrations(db)
    users = UserRepo(db)
    uid = users.create(username="legacy", role="user", permissions=["experts"])
    roles = UserRoleRepo(db)
    role = roles.create(user_role_name="Legacy", permissions=["experts"], policies=[])
    run_migrations(db)
    expected = {"experts"}
    assert set(users.get(uid).permissions) == expected
    assert set(roles.get(role.user_role_id).permissions) == expected
    users.set_permissions(uid, ["experts.view"])
    with db.connect() as conn:
        conn.execute(
            "UPDATE user_role SET permissions = ? WHERE user_role_id = ?",
            (json.dumps(["experts.view"]), role.user_role_id),
        )
    run_migrations(db)
    assert users.get(uid).permissions == ["experts.view"]
    assert roles.get(role.user_role_id).permissions == ["experts.view"]
