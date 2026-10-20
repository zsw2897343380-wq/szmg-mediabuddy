import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SystemSkillsPanel from "./SystemSkillsPanel";

const api = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn() }));
vi.mock("../../api/modules/publicResources", () => ({
  publicResourcesApi: api,
}));
vi.mock("react-i18next", () => {
  const t = (key: string, options?: { name?: string }) =>
    options?.name ? `${key} ${options.name}` : key;
  return { useTranslation: () => ({ t }) };
});
beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue([
    {
      resource_type: "builtin_skill",
      resource_id: "mcporter",
      name: "mcporter",
      description: "Legacy MCP",
      enabled: true,
    },
    {
      resource_type: "builtin_skill",
      resource_id: "octop-assistant",
      name: "Octop 配置助手",
      description: "Configure instance",
      enabled: false,
    },
    {
      resource_type: "package_skill",
      resource_id: "private/skill",
      name: "Other package skill",
      description: "",
      enabled: true,
    },
  ]);
  api.update.mockResolvedValue(undefined);
});
describe("System skill management", () => {
  it("shows system and legacy skills, keeps withdrawn items manageable, and updates global policy", async () => {
    render(<SystemSkillsPanel query="" revision={0} />);
    const toggle = await screen.findByRole("switch", {
      name: "skillsCenter.systemToggle mcporter",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(
      screen
        .getByRole("switch", {
          name: "skillsCenter.systemToggle Octop 配置助手",
        })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.queryByText("Other package skill")).toBeNull();
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        "builtin_skill",
        ["mcporter"],
        false,
      ),
    );
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("false"),
    );
  });
  it("keeps the original status when the server denies publication changes", async () => {
    api.update.mockRejectedValue(new Error("denied"));
    render(<SystemSkillsPanel query="mcporter" revision={0} />);
    const toggle = await screen.findByRole("switch", {
      name: "skillsCenter.systemToggle mcporter",
    });
    fireEvent.click(toggle);
    expect(await screen.findByText("denied")).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText("Octop 配置助手")).toBeNull();
  });
});
