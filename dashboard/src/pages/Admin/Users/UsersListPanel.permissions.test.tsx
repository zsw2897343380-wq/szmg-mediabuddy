import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  t: (key: string) => key,
  actor: {
    id: 1,
    username: "operator",
    role: "user",
    display_name: null,
    locale: "zh",
    permissions: ["users.view", "users.edit"],
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: state.t }),
}));
vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => state.actor,
  useSetCurrentUser: () => vi.fn(),
}));
vi.mock("../../../hooks/useServerTimezone", () => ({
  useServerTimezone: () => "Asia/Shanghai",
}));
vi.mock("../../../api/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: vi.fn(),
}));
vi.mock("../../Experts/components/AgentCard", () => ({
  AgentCard: () => null,
}));
vi.mock("../../Experts/components/EditAgentDrawer", () => ({
  default: () => null,
}));
vi.mock("./InviteDrawer", () => ({ default: () => null }));
vi.mock("../../Experts/components/RootDirSelect", () => ({
  default: () => null,
}));

import { request } from "../../../api/request";
import UsersListPanel from "./UsersListPanel";

const target = {
  id: 2,
  username: "target",
  role: "user",
  role_name: "User",
  display_name: "Before",
  email: null,
  disabled: false,
  permissions: ["chat.view"],
};

describe("delegated user edit form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actor.permissions = ["users.view", "users.edit"];
    vi.mocked(request).mockImplementation(async (path, options) => {
      if (path === "/auth/me") return state.actor as never;
      if (path === "/users") return [target] as never;
      if (path === "/users/roles")
        return [
          {
            user_role_id: "user",
            user_role_name: "User",
            system_role: "user",
            permissions: ["chat.view"],
            policies: [],
          },
        ] as never;
      if (path === "/users/permissions") return [] as never;
      if (path.startsWith("/agents")) return [] as never;
      if (path === "/filesystem/defaults")
        return {
          tree_root: "/",
          browse_roots: ["/"],
          in_container: false,
        } as never;
      if (path === "/users/2" && options?.method === "PATCH")
        return target as never;
      if (path.includes("preferences")) return {} as never;
      throw new Error(`Unexpected test request: ${path}`);
    });
  }, 15_000);

  it("lets a profile editor save without submitting authorization fields", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UsersListPanel />
      </MemoryRouter>,
    );
    await user.click(
      await screen.findByRole("button", { name: "common.edit" }),
    );
    const input = await screen.findByLabelText("adminUsers.formDisplayName");
    await user.clear(input);
    await user.type(input, "After");
    await user.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => {
      const call = vi
        .mocked(request)
        .mock.calls.find(
          ([path, options]) =>
            path === "/users/2" && options?.method === "PATCH",
        );
      expect(call).toBeDefined();
      expect(JSON.parse(call![1]!.body as string)).toEqual({
        display_name: "After",
        email: null,
      });
    });
  }, 15_000);

  it("lets a permission manager save without submitting profile fields", async () => {
    state.actor.permissions = ["users.view", "users.permissions"];
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <UsersListPanel />
      </MemoryRouter>,
    );
    await user.click(
      await screen.findByRole("button", { name: "common.edit" }),
    );
    expect(
      await screen.findByLabelText("adminUsers.formDisplayName"),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => {
      const call = vi
        .mocked(request)
        .mock.calls.find(
          ([path, options]) =>
            path === "/users/2" && options?.method === "PATCH",
        );
      expect(call).toBeDefined();
      const payload = JSON.parse(call![1]!.body as string);
      expect(payload).not.toHaveProperty("display_name");
      expect(payload).not.toHaveProperty("email");
      expect(payload.role).toBe("user");
      expect(payload.permissions).toEqual(["chat.view"]);
    });
  }, 15_000);
});
