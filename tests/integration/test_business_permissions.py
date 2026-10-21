"""Basic business is open while management and ownership remain protected."""

from pathlib import Path
from typing import Any

from tests.support.auth import create_agent, create_user


async def test_user_without_grants_can_create_and_manage_own_team(
    env_with_provider: Any, tmp_path: Path
) -> None:
    client, server, admin = env_with_provider
    auth = await create_user(client, admin, username="business", permissions=[])
    probe = await client.post("/api/filesystem/probe", headers=auth, json={"path": str(tmp_path)})
    assert probe.status_code == 200 and probe.json()["ok"], probe.text
    members = [await create_agent(client, auth, name=f"member_{i}") for i in range(2)]
    for member in members:
        server.services.agent_repo.set_state(member, "running")
    response = await client.post(
        "/api/teams", headers=auth, json={"name": "News team", "member_ids": members}
    )
    assert response.status_code == 200, response.text
    team_id = response.json()["agent_id"]
    assert (await client.get(f"/api/teams/{team_id}", headers=auth)).status_code == 200
    assert (
        await client.patch(f"/api/teams/{team_id}", headers=auth, json={"name": "Renamed"})
    ).status_code == 200
    other = await create_user(client, admin, username="other_business", permissions=[])
    for path in (f"/api/teams/{team_id}", f"/api/agents/{team_id}"):
        assert (await client.patch(path, headers=other, json={"name": "Denied"})).status_code == 403
        assert (await client.delete(path, headers=other)).status_code == 403
    for path in (
        "/api/bridge/connections",
        "/api/users",
        "/api/admin/providers",
    ):
        assert (await client.get(path, headers=auth)).status_code == 403
    assert (await client.delete(f"/api/teams/{team_id}", headers=auth)).status_code == 204
