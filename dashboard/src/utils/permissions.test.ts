import { describe, expect, it } from "vitest";
import { canAccessPath, navAllowed, userCan } from "./permissions";

const viewer = (permissions: string[]) => ({ role: "user", permissions });

describe("operation permissions", () => {
  it("keeps legacy grants while separating read-only operations", () => {
    expect(userCan(viewer(["experts"]), "experts.delete")).toBe(true);
    expect(userCan(viewer(["experts.view"]), "experts")).toBe(true);
    expect(userCan(viewer(["experts.view"]), "experts.delete")).toBe(false);
    expect(userCan(viewer(["token_usage"]), "token_usage.all")).toBe(false);
  });

  it.each([
    ["chat", "/assistants", "assistants.view"],
    ["bridge", "/bridge", "bridge.view"],
    ["acp", "/acp", "acp.view"],
    [
      "admin-public-resources",
      "/admin/public-resources",
      "public_resources.view",
    ],
  ] as const)(
    "gates %s in navigation and direct routes",
    (nav, path, permission) => {
      expect(navAllowed(viewer([]), nav)).toBe(false);
      expect(canAccessPath(viewer([]), path)).toBe(false);
      expect(navAllowed(viewer([permission]), nav)).toBe(true);
      expect(canAccessPath(viewer([permission]), path)).toBe(true);
    },
  );
});
