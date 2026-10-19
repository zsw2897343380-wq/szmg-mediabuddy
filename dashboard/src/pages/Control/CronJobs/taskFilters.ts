import type { CronJobSpecOutput } from "../../../api/types";
import { extractPromptFromJob } from "./cronDisplay";
export type CronStatusFilter = "all" | "enabled" | "paused";
export function filterCronJobs(
  jobs: CronJobSpecOutput[],
  status: CronStatusFilter,
  keyword: string,
) {
  const query = keyword.trim().toLocaleLowerCase();
  return jobs.filter(
    (job) =>
      (status === "all" ||
        (status === "enabled" ? job.enabled : !job.enabled)) &&
      (!query ||
        `${job.name} ${extractPromptFromJob(job)}`
          .toLocaleLowerCase()
          .includes(query)),
  );
}
