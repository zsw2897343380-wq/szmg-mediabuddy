interface DefaultChatAgent {
  agent_id: string;
  template_name?: string | null;
  config?: Record<string, unknown>;
  bridge?: boolean;
}

/** The private general runtime is not a selected specialist. */
export function isDefaultChatAgent(
  agent: DefaultChatAgent | null | undefined,
): boolean {
  return Boolean(
    agent &&
      !agent.bridge &&
      (agent.config?.general_chat === true ||
        (agent.agent_id === "main" &&
          agent.template_name === "general-assistant")),
  );
}
