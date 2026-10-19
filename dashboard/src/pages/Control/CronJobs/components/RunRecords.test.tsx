import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { octopCronApi } from "../../../../api/modules/cronjob";
import type { OctopCronRunRecords } from "../../../../api/types";
import { RunRecords } from "./RunRecords";
vi.mock("../../../../api/modules/cronjob", () => ({
  octopCronApi: { records: vi.fn() },
}));
const props = {
  agentId: "alice",
  jobs: [],
  timeZone: "Asia/Shanghai",
  keyword: "",
  onTaskChange: vi.fn(),
  revision: 0,
};
const page: OctopCronRunRecords = {
  items: [
    {
      id: 1,
      cron_id: "job",
      name: "Daily report",
      executed_at: 1_800_000_000,
      status: "error",
      error: "Provider unavailable",
    },
  ],
  has_more: false,
};
beforeEach(() => vi.mocked(octopCronApi.records).mockReset());
describe("run records", () => {
  it("shows a real failure and retries a failed request", async () => {
    vi.mocked(octopCronApi.records)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(page);
    render(<RunRecords {...props} />);
    expect(
      await screen.findByText("cronJobs.workbuddy.recordsFailed"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "cronJobs.workbuddy.loadMore" }),
    );
    expect(await screen.findByText("Provider unavailable")).toBeInTheDocument();
    expect(screen.getByText("Daily report")).toBeInTheDocument();
  });
  it("ignores a previous expert's late request", async () => {
    let resolveOld!: (value: OctopCronRunRecords) => void;
    vi.mocked(octopCronApi.records)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ items: [], has_more: false });
    const { rerender } = render(<RunRecords {...props} />);
    rerender(<RunRecords {...props} agentId="bob" />);
    await waitFor(() =>
      expect(octopCronApi.records).toHaveBeenCalledWith("bob", 0, undefined),
    );
    await act(async () => resolveOld(page));
    expect(screen.queryByText("Daily report")).not.toBeInTheDocument();
  });
});
