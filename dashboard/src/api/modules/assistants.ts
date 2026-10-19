import { request } from "../request";
import type { OctopAgent } from "../../context/AgentContext";
export interface AssistantTemplate {
  id: string;
  label: { zh?: string; en?: string };
}

export interface AssistantFormValues {
  name: string;
  role: string;
  description: string;
  default_model?: string | null;
  template_name: string;
  knowledge_base_ids: string[];
}

export function assistantPayload(values: AssistantFormValues) {
  return {
    name: values.name.trim(),
    description: values.role.trim(),
    system_prompt: values.description.trim(),
    default_model: values.default_model || null,
    template_name: values.template_name,
    knowledge_base_ids: values.knowledge_base_ids,
  };
}

export const assistantsApi = {
  templates: () => request<AssistantTemplate[]>("/experts"),
  create: (values: AssistantFormValues) =>
    request<OctopAgent>("/agents", {
      method: "POST",
      body: JSON.stringify(assistantPayload(values)),
    }),
  update: (agent: OctopAgent, values: AssistantFormValues) =>
    request<OctopAgent>(`/agents/${encodeURIComponent(agent.agent_id)}`, {
      method: "PATCH",
      body: JSON.stringify(assistantPayload(values)),
    }),
  remove: (agentId: string) =>
    request<void>(`/agents/${encodeURIComponent(agentId)}`, {
      method: "DELETE",
    }),
  setRunning: (agentId: string, running: boolean) =>
    request<void>(
      `/agents/${encodeURIComponent(agentId)}/${running ? "start" : "stop"}`,
      { method: "POST" },
    ),
};
