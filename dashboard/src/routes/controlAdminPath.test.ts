import { describe, expect, it } from "vitest";
import {
  ADVANCED_TAB_PERMISSIONS,
  canAccessPath,
  NAV_PERMISSIONS,
  pathPermissionKeys,
  PERM,
} from "../utils/permissions";
import { isWorkbenchPath, resolveSelectedKey, routeConfigs } from "./index";

describe("pathPermissionKeys", () => {
  it("matches workbench and legacy aliases", () => {
    expect(isWorkbenchPath("/workbench")).toBe(true);
    expect(pathPermissionKeys("/workbench")).toEqual([...PERM.workbench]);
    expect(pathPermissionKeys("/workbench/terminal")).toEqual([
      ...PERM.terminal,
    ]);
    expect(pathPermissionKeys("/workbench/browser")).toEqual([...PERM.browser]);
    expect(pathPermissionKeys("/terminal")).toEqual([...PERM.terminal]);
    expect(pathPermissionKeys("/remote-browser")).toEqual([...PERM.browser]);
  });

  it("matches remote desktop hub tabs and acp", () => {
    expect(pathPermissionKeys("/remote-desktop")).toEqual([
      "desktop",
      "mobile",
    ]);
    expect(pathPermissionKeys("/remote-desktop/desktop")).toEqual([
      ...PERM.desktop,
    ]);
    expect(pathPermissionKeys("/remote-desktop/phone")).toEqual([
      ...PERM.mobile,
    ]);
    expect(pathPermissionKeys("/remote-phone")).toEqual([...PERM.mobile]);
    expect(pathPermissionKeys("/acp")).toEqual(["acp"]);
  });

  it("keeps sso on users page, not advanced", () => {
    expect(pathPermissionKeys("/admin/users")).toEqual([...PERM.usersPage]);
    expect(pathPermissionKeys("/admin/advanced")).toEqual([
      ...PERM.advancedPage,
    ]);
    expect([...PERM.advancedPage]).not.toContain("sso");
    expect(NAV_PERMISSIONS["admin-users"]).toEqual(PERM.usersPage);
    expect(NAV_PERMISSIONS["admin-advanced"]).toEqual(PERM.advancedPage);
    expect(ADVANCED_TAB_PERMISSIONS.captcha).toBe("captcha");
    expect("bridge" in ADVANCED_TAB_PERMISSIONS).toBe(false);
    expect(pathPermissionKeys("/bridge")).toEqual(["bridge"]);
    expect([...PERM.advancedPage]).toContain("captcha");
  });

  it("keeps voice and search on models page, not advanced", () => {
    expect(pathPermissionKeys("/admin/models")).toEqual([...PERM.modelsPage]);
    expect(pathPermissionKeys("/admin/voice")).toEqual([...PERM.modelsPage]);
    expect([...PERM.modelsPage]).toContain("voice");
    expect([...PERM.modelsPage]).toContain("search");
    expect([...PERM.advancedPage]).not.toContain("voice");
    expect([...PERM.advancedPage]).not.toContain("search");
    expect(NAV_PERMISSIONS.models).toEqual(PERM.modelsPage);
  });

  it("gates chat and bridge while keeping redirect aliases available", () => {
    expect(pathPermissionKeys("/chat")).toEqual(["chat", "records"]);
    expect(pathPermissionKeys("/bridge")).toEqual(["bridge"]);
    expect(pathPermissionKeys("/personalization/acp")).toBeNull();
  });

  it("opens business pages but keeps Token statistics gated", () => {
    expect(pathPermissionKeys("/experts")).toEqual([...PERM.experts]);
    expect(pathPermissionKeys("/tasks")).toEqual([...PERM.tasks]);
    expect(pathPermissionKeys("/token-usage")).toEqual([...PERM.tokenUsage]);
    const user = { role: "user", permissions: ["experts"] };
    expect(canAccessPath(user, "/experts")).toBe(true);
    expect(canAccessPath(user, "/tasks")).toBe(true);
    expect(canAccessPath(user, "/chat")).toBe(true);
    expect(canAccessPath(user, "/token-usage")).toBe(false);
  });

  it("gates settings modules", () => {
    expect(pathPermissionKeys("/connectors")).toEqual([...PERM.connectors]);
    expect(pathPermissionKeys("/skill-packages")).toEqual([
      ...PERM.skillPackages,
    ]);
    expect(pathPermissionKeys("/personalization/skills")).toEqual([
      ...PERM.skills,
      ...PERM.skillPackages,
    ]);
    expect(pathPermissionKeys("/personalization/channels")).toEqual([
      ...PERM.channels,
    ]);
    expect(pathPermissionKeys("/personalization/tools")).toEqual([
      ...PERM.tools,
    ]);
    expect(pathPermissionKeys("/personalization/plugins")).toEqual([
      ...PERM.agentPlugins,
    ]);
    expect(pathPermissionKeys("/personalization/memory")).toEqual([
      ...PERM.memory,
    ]);
    expect(pathPermissionKeys("/memory")).toEqual([...PERM.memory]);
    expect(NAV_PERMISSIONS.personalization).toEqual(PERM.personalization);
    expect(pathPermissionKeys("/knowledge-bases")).toEqual([
      ...PERM.knowledgeBasesPage,
    ]);
    expect([...PERM.advancedPage]).not.toContain("knowledge_settings");
  });

  it("canAccessPath respects holder permissions", () => {
    const user = { role: "user", permissions: ["desktop"] };
    expect(canAccessPath(user, "/remote-desktop")).toBe(true);
    expect(canAccessPath(user, "/remote-desktop/desktop")).toBe(true);
    expect(canAccessPath(user, "/remote-desktop/phone")).toBe(false);
    expect(
      canAccessPath(
        { role: "user", permissions: ["mobile"] },
        "/remote-desktop/phone",
      ),
    ).toBe(true);
    expect(canAccessPath(user, "/admin/users")).toBe(false);
    expect(canAccessPath({ role: "admin", permissions: [] }, "/acp")).toBe(
      true,
    );
    expect(
      canAccessPath(
        { role: "user", permissions: ["knowledge_bases"] },
        "/knowledge-bases",
      ),
    ).toBe(true);
    expect(
      canAccessPath(
        { role: "user", permissions: ["knowledge_settings"] },
        "/knowledge-bases",
      ),
    ).toBe(true);
    expect(
      canAccessPath(
        { role: "user", permissions: ["knowledge_bases"] },
        "/admin/advanced",
      ),
    ).toBe(false);
  });
});

describe("unknown dashboard paths", () => {
  it("do not highlight a sidebar item", () => {
    expect(resolveSelectedKey("/does-not-exist")).toBe("");
  });

  it("are caught by the not-found route", () => {
    expect(routeConfigs.some((rc) => rc.path === "*")).toBe(true);
  });
});

describe("combined capability center routes", () => {
  it("selects one navigation entry while opening business resources by default", () => {
    for (const path of [
      "/experts",
      "/skills",
      "/connectors",
      "/skill-packages",
    ]) {
      expect(resolveSelectedKey(path)).toBe("experts");
      expect(routeConfigs.some((rc) => rc.path === path)).toBe(true);
    }
    expect(canAccessPath({ role: "user", permissions: [] }, "/skills")).toBe(
      true,
    );
    expect(
      canAccessPath({ role: "user", permissions: [] }, "/connectors"),
    ).toBe(true);
    expect(
      canAccessPath({ role: "user", permissions: [] }, "/skill-packages"),
    ).toBe(true);
  });
});
