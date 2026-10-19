import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GeneralChatEntry from "./GeneralChatEntry";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  refresh: vi.fn(),
  setActiveAgent: vi.fn(),
}));
vi.mock("../../../api/modules/defaultChat", () => ({
  defaultChatApi: { ensure: mocks.ensure },
}));
vi.mock("../../../context/AgentContext", () => ({
  useAgent: () => ({ ...mocks, agents: [] }),
}));
vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ id: 1, role: "admin" }),
}));

function Target() {
  const location = useLocation();
  return (
    <div data-testid="destination">
      {JSON.stringify({ path: location.pathname, state: location.state })}
    </div>
  );
}
function openEntry() {
  return render(
    <MemoryRouter
      initialEntries={[
        { pathname: "/chat", state: { prefillInput: "a draft" } },
      ]}
    >
      <Routes>
        <Route path="/chat" element={<GeneralChatEntry />} />
        <Route path="/chat/:id" element={<Target />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("general chat entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockResolvedValue(undefined);
  });
  it("opens a blank general chat without requiring any experts", async () => {
    mocks.ensure.mockResolvedValue({ agent_id: "own-general" });
    openEntry();
    const destination = await screen.findByTestId("destination");
    expect(JSON.parse(destination.textContent || "{}")).toEqual({
      path: "/chat/own-general",
      state: { newChat: true, prefillInput: "a draft" },
    });
    expect(mocks.refresh).toHaveBeenCalledWith({ silent: true, force: true });
    expect(mocks.setActiveAgent).toHaveBeenCalledWith("own-general");
  });
  it("shows an error and retries rather than pretending that chat is ready", async () => {
    mocks.ensure
      .mockRejectedValueOnce(new Error("Model unavailable"))
      .mockResolvedValueOnce({ agent_id: "ready" });
    openEntry();
    expect(await screen.findByText("Model unavailable")).toBeInTheDocument();
    expect(mocks.setActiveAgent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() =>
      expect(screen.getByTestId("destination")).toHaveTextContent(
        "/chat/ready",
      ),
    );
  });
  it("does not redirect after the user leaves the page while preparation is pending", async () => {
    let resolve!: (value: { agent_id: string }) => void;
    mocks.ensure.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = openEntry();
    view.unmount();
    await act(async () => resolve({ agent_id: "late" }));
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.setActiveAgent).not.toHaveBeenCalled();
  });
});
