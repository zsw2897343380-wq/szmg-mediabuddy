from pathlib import Path

from octop.config import OctopConfig
from octop.infra.cron.history import list_cron_run_records
from octop.infra.db.migrate import run_migrations
from octop.infra.db.pool import SqlitePool
from octop.infra.db.services import RepoBundle, SharedServices
from octop.infra.utils.paths import PathLayout


def test_history_joins_both_agent_and_job_owner_before_limit(tmp_path: Path) -> None:
    pool = SqlitePool(tmp_path / "history.db")
    run_migrations(pool)
    repos = RepoBundle.from_pool(pool)
    alice = repos.user_repo.create(username="alice", password_hash="unused", role="user")
    bob = repos.user_repo.create(username="bob", password_hash="unused", role="user")
    repos.agent_repo.create(agent_id="a", user_id=alice, name="Alice")
    repos.agent_repo.create(agent_id="b", user_id=bob, name="Bob")
    for cid, aid, uid in [
        ("visible", "a", alice),
        ("wrong-job-owner", "a", bob),
        ("wrong-agent-owner", "b", alice),
    ]:
        repos.cron_repo.create(
            cron_id=cid,
            agent_id=aid,
            user_id=uid,
            trigger="interval:60",
            prompt="prompt",
            session_key="session",
        )
        repos.audit_repo.system_event("cron.run_ok", target=cid)
    services = SharedServices(paths=PathLayout(tmp_path), config=OctopConfig(), repos=repos)
    items, more = list_cron_run_records(services, agent_id="a", user_id=alice, limit=1)
    assert [item.cron_id for item in items] == ["visible"]
    assert not more
    assert list_cron_run_records(services, agent_id="a", user_id=bob)[0] == []
    assert list_cron_run_records(services, agent_id="b", user_id=alice)[0] == []
