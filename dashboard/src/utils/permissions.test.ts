import { describe, expect, it } from "vitest";
import { canAccessPath, navAllowed, userCan } from "./permissions";

const viewer = (permissions: string[]) => ({ role: "user", permissions });

describe("operation permissions", () => {
  it("keeps legacy grants while separating read-only operations", () => {
    expect(userCan(viewer(["bridge"]), "bridge.delete")).toBe(true);
    expect(userCan(viewer(["bridge.view"]), "bridge")).toBe(true);
    expect(userCan(viewer(["bridge.view"]), "bridge.delete")).toBe(false);
    expect(userCan(viewer(["token_usage"]), "token_usage.all")).toBe(false);
  });

  it.each([
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

it("keeps basic business pages open to an authenticated user", () => {
  for (const key of [
    "chat.use",
    "experts.create",
    "skills.use",
    "connectors.create",
    "knowledge_bases.edit",
    "tasks.create",
    "records.delete",
  ])
    expect(userCan(viewer([]), key)).toBe(true);
  expect(canAccessPath(viewer([]), "/assistants")).toBe(true);
  expect(userCan(null, "experts.create")).toBe(false);
});
