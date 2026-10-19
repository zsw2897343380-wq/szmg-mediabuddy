import { describe, expect, it } from "vitest";
import type { CronJobSpecOutput } from "../../../api/types";
import { filterCronJobs } from "./taskFilters";
const jobs = [
  {
    id: "1",
    name: "Report",
    enabled: true,
    request: { input: "Finance summary" },
  },
  { id: "2", name: "Reminder", enabled: false, request: { input: "Stand up" } },
] as CronJobSpecOutput[];
describe("task filters", () => {
  it("combines status with case-insensitive name and prompt matching", () => {
    expect(
      filterCronJobs(jobs, "enabled", " finance ").map((job) => job.id),
    ).toEqual(["1"]);
    expect(filterCronJobs(jobs, "paused", "REPORT")).toEqual([]);
    expect(filterCronJobs(jobs, "all", "remind").map((job) => job.id)).toEqual([
      "2",
    ]);
  });
});
