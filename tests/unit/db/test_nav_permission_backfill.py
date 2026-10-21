"""Starting the application never restores revoked operation grants."""

from pathlib import Path

from octop.infra.db.migrate import run_migrations
from octop.infra.db.pool import SqlitePool
from octop.infra.db.repos.users import UserRepo


def test_restart_does_not_restore_revoked_operations(tmp_path: Path) -> None:
    db = SqlitePool(tmp_path / "permissions.db")
    run_migrations(db)
    users = UserRepo(db)
    user_id = users.create(username="reader", role="user", permissions=["experts.view"])
    users.set_permissions(user_id, [])
    run_migrations(db)
    assert users.get(user_id).permissions == []
