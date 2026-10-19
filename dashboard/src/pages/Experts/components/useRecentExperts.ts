import { useEffect, useMemo, useRef, useState } from "react";
import {
  octopThreadsApi,
  type OctopThread,
} from "../../../api/modules/octopThreads";
import type { OctopAgent } from "../../../context/AgentContext";

export function latestExpertActivity(threads: OctopThread[]): number | null {
  const times = threads
    .filter(
      (thread) =>
        thread.has_messages !== false &&
        Number.isFinite(thread.last_active) &&
        thread.last_active > 0,
    )
    .map((thread) => thread.last_active);
  return times.length ? Math.max(...times) : null;
}

export function useRecentExperts(agents: OctopAgent[], enabled: boolean) {
  const ids = useMemo(
    () =>
      agents
        .filter((agent) => !agent.bridge && agent.kind !== "team")
        .map((agent) => agent.agent_id)
        .sort()
        .join("\0"),
    [agents],
  );
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!enabled) {
      setLoading(false);
      return;
    }
    setActivity({});
    setFailed(false);
    const expertIds = ids ? ids.split("\0") : [];
    if (!expertIds.length) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.allSettled(
      expertIds.map(async (id) => ({
        id,
        lastActive: latestExpertActivity(
          await octopThreadsApi.list(id, 1, "activity"),
        ),
      })),
    ).then((results) => {
      if (generation.current !== current) return;
      const next: Record<string, number> = {};
      for (const result of results)
        if (result.status === "fulfilled" && result.value.lastActive !== null)
          next[result.value.id] = result.value.lastActive;
      setActivity(next);
      setFailed(results.some((result) => result.status === "rejected"));
      setLoading(false);
    });
    return () => {
      generation.current += 1;
    };
  }, [enabled, ids]);

  const recent = useMemo(
    () =>
      agents
        .filter(
          (agent) =>
            !agent.bridge &&
            agent.kind !== "team" &&
            activity[agent.agent_id] !== undefined,
        )
        .sort((a, b) => activity[b.agent_id]! - activity[a.agent_id]!)
        .slice(0, 3),
    [activity, agents],
  );
  return { recent, loading, failed };
}
