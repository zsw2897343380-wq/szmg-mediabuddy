import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  t: (key: string) => key,
  refresh: vi.fn(),
  actor: { role: "user", permissions: ["bridge.view"] },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: state.t }) }));
vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => state.actor,
}));
vi.mock("../../../context/AgentContext", () => ({
  useAgent: () => ({ refresh: state.refresh }),
}));
vi.mock("../../../api/modules/bridge", () => ({
  bridgeApi: { list: vi.fn(), create: vi.fn(), listAgents: vi.fn() },
}));
import { bridgeApi } from "../../../api/modules/bridge";
import BridgeSettingsPanel from "./BridgeSettings";

describe("bridge operation grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actor.permissions = ["bridge.view"];
    vi.mocked(bridgeApi.list).mockResolvedValue([]);
    vi.mocked(bridgeApi.create).mockResolvedValue({
      connection_id: "test",
    } as never);
  });

  it("does not offer creation to a viewer", async () => {
    render(
      <MemoryRouter>
        <BridgeSettingsPanel asPage />
      </MemoryRouter>,
    );
    await screen.findByText("advancedSettings.bridge.emptyTitle");
    const buttons = screen.getAllByRole("button", {
      name: "advancedSettings.bridge.add",
    });
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) expect(button).toBeDisabled();
  });

  it("lets create-only users save an offline connection", async () => {
    state.actor.permissions = ["bridge.view", "bridge.create"];
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BridgeSettingsPanel asPage />
      </MemoryRouter>,
    );
    await screen.findByText("advancedSettings.bridge.emptyTitle");
    await user.click(
      screen.getAllByRole("button", { name: "advancedSettings.bridge.add" })[0],
    );
    await user.type(
      await screen.findByLabelText("advancedSettings.bridge.displayName"),
      "Test",
    );
    await user.type(
      screen.getByLabelText("advancedSettings.bridge.peerUrl"),
      "https://test.invalid",
    );
    await user.type(
      screen.getByLabelText("advancedSettings.bridge.peerAccount"),
      "test",
    );
    await user.type(
      screen.getByLabelText("advancedSettings.bridge.password"),
      "test",
    );
    await user.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() =>
      expect(bridgeApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ connect: false }),
      ),
    );
  }, 15_000);
});
