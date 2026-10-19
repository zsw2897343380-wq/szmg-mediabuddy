import { request } from "../request";

export const defaultChatApi = {
  ensure: () =>
    request<{ agent_id: string }>("/chat/default-agent", { method: "POST" }),
};
