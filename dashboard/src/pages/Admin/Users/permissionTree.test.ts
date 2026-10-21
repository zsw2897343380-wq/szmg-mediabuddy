import { describe, expect, it } from "vitest";
import {
  buildPermissionTree,
  normalizeTreeSelection,
  toggleTreeSelection,
} from "./permissionTree";

const catalog = [
  { key: "bridge.view", category: "settings", label: "云端协同 · 查看" },
  { key: "bridge.create", category: "settings", label: "云端协同 · 新增" },
  { key: "terminal.use", category: "control", label: "终端 · 使用" },
  { key: "workspace.view", category: "settings", label: "工作区文件 · 查看" },
  { key: "users.view", category: "admin", label: "用户 · 查看" },
  { key: "experts.create", category: "nav", label: "专家 · 新增" },
  { key: "skills.use", category: "settings", label: "技能 · 使用" },
];

describe("permission tree", () => {
  it("shows only settings/control/admin and groups operations under functions", () => {
    const tree = buildPermissionTree(catalog, (key) => key);
    expect(tree.map((node) => node.key)).toEqual([
      "category:settings",
      "category:control",
      "category:admin",
    ]);
    const bridge = tree[0].children![0];
    expect(bridge.title).toBe("云端协同");
    expect(bridge.children!.map((node) => node.title)).toEqual([
      "查看",
      "新增",
    ]);
    expect(tree.flatMap((node) => node.permissionKeys)).not.toContain(
      "experts.create",
    );
    expect(tree.flatMap((node) => node.permissionKeys)).not.toContain(
      "skills.use",
    );
    expect(tree[1].children![0].permissionKeys).toEqual([
      "terminal.use",
      "workspace.view",
    ]);
  });

  it("adds view when checking an action and clears actions when view is removed", () => {
    const selected = toggleTreeSelection([], ["bridge.create"], true, catalog);
    expect(new Set(selected)).toEqual(
      new Set(["bridge.view", "bridge.create"]),
    );
    expect(
      toggleTreeSelection(selected, ["bridge.view"], false, catalog),
    ).toEqual([]);
  });

  it("toggles a branch without changing permissions from other branches", () => {
    const selected = toggleTreeSelection(
      ["users.view"],
      ["bridge.view", "bridge.create"],
      true,
      catalog,
    );
    expect(new Set(selected)).toEqual(
      new Set(["users.view", "bridge.view", "bridge.create"]),
    );
    expect(
      toggleTreeSelection(
        selected,
        ["bridge.view", "bridge.create"],
        false,
        catalog,
      ),
    ).toEqual(["users.view"]);
  });

  it("expands old module grants without granting platform-wide usage statistics", () => {
    const statistics = [
      { key: "token_usage.view", category: "settings", label: "Token · 查看" },
      { key: "token_usage.all", category: "admin", label: "Token · 全平台" },
    ];
    expect(
      normalizeTreeSelection(["token_usage", "experts", "unknown"], statistics),
    ).toEqual(["token_usage.view"]);
    expect(
      buildPermissionTree(statistics, (key) => key)[0].permissionKeys,
    ).toEqual(["token_usage.view", "token_usage.all"]);
  });
});
