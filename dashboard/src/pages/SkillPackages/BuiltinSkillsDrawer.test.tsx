import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BuiltinSkillsDrawer from "./BuiltinSkillsDrawer";

const mocks = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn() }));
vi.mock("../../api/modules/builtinSkills", () => ({ builtinSkillsApi: mocks }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) =>
      values?.name ? `${key} ${values.name}` : key,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([
    {
      slug: "apple-notes",
      name: "Notes preset",
      description: "Notes",
      enabled: true,
    },
    {
      slug: "docker-management",
      name: "Docker preset",
      description: "Containers",
      enabled: false,
    },
  ]);
  mocks.update.mockResolvedValue(undefined);
});

describe("preset skill management", () => {
  it("loads only when opened and restores a disabled skill", async () => {
    const view = render(<BuiltinSkillsDrawer open={false} onClose={vi.fn()} />);
    expect(mocks.list).not.toHaveBeenCalled();
    view.rerender(<BuiltinSkillsDrawer open onClose={vi.fn()} />);
    const toggle = await screen.findByRole("switch", { name: /Docker preset/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(["docker-management"], true),
    );
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("disables all enabled presets even when the list is filtered", async () => {
    render(<BuiltinSkillsDrawer open onClose={vi.fn()} />);
    await screen.findByRole("switch", { name: /Notes preset/ });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Docker" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /一键禁用全部|Disable all presets|disableAllPresets/,
      }),
    );
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(["apple-notes"], false),
    );
  });

  it("keeps the prior state visible when the request fails", async () => {
    mocks.update.mockRejectedValue(new Error("Request failed"));
    render(<BuiltinSkillsDrawer open onClose={vi.fn()} />);
    const toggle = await screen.findByRole("switch", { name: /Notes preset/ });
    fireEvent.click(toggle);
    await screen.findByRole("alert");
    expect(toggle).toBeChecked();
  });
});
