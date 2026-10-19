let pending: { agentId: string; serverName: string } | null = null;

export function setPendingAttachConnector(
  agentId: string,
  serverName: string,
): void {
  pending = { agentId, serverName };
}

export function peekPendingAttachConnector(
  agentId: string | null | undefined,
): string | null {
  return pending && pending.agentId === agentId ? pending.serverName : null;
}

export function consumePendingAttachConnector(
  agentId: string | null | undefined,
): string | null {
  const serverName = peekPendingAttachConnector(agentId);
  if (serverName) pending = null;
  return serverName;
}
