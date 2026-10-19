"""Owner-scoped projection of completed cron audit events."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from octop.infra.db.services import SharedServices


@dataclass(frozen=True)
class CronRunRecord:
    id: int
    cron_id: str
    name: str
    executed_at: int
    status: Literal["ok", "error"]
    error: str | None


def list_cron_run_records(
    services: SharedServices,
    *,
    agent_id: str,
    user_id: int,
    cron_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[CronRunRecord], bool]:
    """Deleted tasks are excluded; audits do not contain duration or conversation IDs."""
    rows = services.audit_repo.query_cron_runs(
        agent_id=agent_id,
        user_id=user_id,
        cron_id=cron_id,
        limit=limit + 1,
        offset=offset,
    )
    return [
        CronRunRecord(
            id=row.id,
            cron_id=row.cron_id,
            name=row.name,
            executed_at=row.ts,
            status="ok" if row.action == "cron.run_ok" else "error",
            error=row.payload if row.action == "cron.run_failed" else None,
        )
        for row in rows[:limit]
    ], len(rows) > limit
