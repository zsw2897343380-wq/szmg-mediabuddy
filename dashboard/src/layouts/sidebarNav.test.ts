import { describe, expect, it } from "vitest";
import {
  SIDEBAR_GROUPED_NAV_KEYS,
  SIDEBAR_NAV_KEYS,
  buildNavSections,
  isGroupedNavKey,
} from "./sidebarNav";
import type { OctopUser } from "../api/modules/auth";

const adminUser = {
  id: 1,
  username: "admin",
  role: "admin",
  permissions: ["*"],
} as OctopUser;

describe("sidebarNav", () => {
  it("opens the assistant workspace independently of a new task", () => {
    const assistant = buildNavSections(adminUser)[0]?.items[0];
    expect(assistant).toMatchObject({
      key: "chat",
      path: "/assistants",
      labelKey: "nav.assistant",
      badge: "BETA",
    });
  });

  it("marks catalog keys as grouped", () => {
    for (const key of SIDEBAR_GROUPED_NAV_KEYS) {
      expect(isGroupedNavKey(key)).toBe(true);
    }
    expect(isGroupedNavKey("chat")).toBe(false);
    expect(isGroupedNavKey("experts")).toBe(false);
  });

  it("places grouped keys only under sections with groupKey", () => {
    const sections = buildNavSections(adminUser, { mobileEnabled: true });
    const flatKeys = new Set(
      sections
        .filter((s) => !s.groupKey)
        .flatMap((s) => s.items.map((i) => i.key)),
    );
    const groupedKeys = new Set(
      sections
        .filter((s) => s.groupKey)
        .flatMap((s) => s.items.map((i) => i.key)),
    );
    for (const key of groupedKeys) {
      expect(isGroupedNavKey(key)).toBe(true);
      expect(flatKeys.has(key)).toBe(false);
    }
    for (const key of flatKeys) {
      expect(isGroupedNavKey(key)).toBe(false);
    }
  });

  it.each([
    ["experts", "/experts"],
    ["skills", "/skills"],
    ["skill_packages", "/skill-packages"],
    ["connectors", "/connectors"],
  ])(
    "opens the permitted center resource for %s-only users",
    (permission, path) => {
      const user = { ...adminUser, role: "user", permissions: [permission] };
      const items = buildNavSections(user).flatMap((section) => section.items);
      expect(items.find((item) => item.key === "experts")?.path).toBe(path);
      expect(items.some((item) => item.key === "personalization")).toBe(false);
    },
  );

  it("covers every catalog key from the admin nav", () => {
    const keys = buildNavSections(adminUser, { mobileEnabled: true }).flatMap(
      (section) => section.items.map((item) => item.key),
    );
    // Legacy persisted keys remain accepted; their UI now lives in the center.
    expect(new Set(keys)).toEqual(
      new Set(
        SIDEBAR_NAV_KEYS.filter(
          (key) => key !== "connectors" && key !== "skill-packages",
        ),
      ),
    );
    const grouped = buildNavSections(adminUser, { mobileEnabled: true }).filter(
      (section) => section.id,
    );
    expect(grouped.map((section) => section.id)).toEqual([
      "settings",
      "control",
      "admin",
    ]);
  });
});
