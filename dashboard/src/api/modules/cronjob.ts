import { request } from "../request";
import type {
  OctopCronRow,
  OctopCronCreateBody,
  OctopCronPatchBody,
  OctopCronRunRecords,
} from "../types";

export interface OctopCronSettings {
  timezone: string;
}

export interface CronTaskExamples {
  zh?: string[];
  en?: string[];
}

export const octopCronApi = {
  records: (agentId: string, offset = 0, cronId?: string) =>
    request<OctopCronRunRecords>(
      `/agents/${agentId}/cron/records?offset=${offset}&limit=100${
        cronId ? `&cron_id=${encodeURIComponent(cronId)}` : ""
      }`,
    ),
  settings: () => request<OctopCronSettings>("/cron/settings"),

  list: (agentId: string) => request<OctopCronRow[]>(`/agents/${agentId}/cron`),

  create: (agentId: string, body: OctopCronCreateBody) =>
    request<OctopCronRow>(`/agents/${agentId}/cron`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  get: (agentId: string, cronId: string) =>
    request<OctopCronRow>(`/agents/${agentId}/cron/${cronId}`),

  patch: (agentId: string, cronId: string, body: OctopCronPatchBody) =>
    request<OctopCronRow>(`/agents/${agentId}/cron/${cronId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  delete: (agentId: string, cronId: string) =>
    request<void>(`/agents/${agentId}/cron/${cronId}`, { method: "DELETE" }),

  runNow: (agentId: string, cronId: string) =>
    request<void>(`/agents/${agentId}/cron/${cronId}/run-now`, {
      method: "POST",
    }),
};
