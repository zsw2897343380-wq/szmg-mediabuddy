import { describe, expect, it } from "vitest";
import {
  buildPermissionTree,
  normalizeTreeSelection,
  toggleTreeSelection,
} from "./permissionTree";

const catalog = [
  { key: "experts.view", category: "nav", label: "专家 · 查看" },
  { key: "experts.create", category: "nav", label: "专家 · 新增" },
  { key: "bridge.view", category: "settings", label: "云端协同 · 查看" },
  { key: "bridge.create", category: "settings", label: "云端协同 · 新增" },
  { key: "terminal.use", category: "control", label: "终端 · 执行" },
  { key: "workspace.view", category: "settings", label: "文件 · 查看" },
  { key: "users.view", category: "admin", label: "用户 · 查看" },
];

describe("permission tree", () => {
  it("includes business, settings, control and administration without losing grants", () => {
    const tree = buildPermissionTree(catalog, (key) => key);
    expect(tree.map((node) => node.key)).toEqual([
      "category:nav",
      "category:settings",
      "category:control",
      "category:admin",
    ]);
    expect(tree.flatMap((node) => node.permissionKeys).sort()).toEqual(
      catalog.map((item) => item.key).sort(),
    );
    expect(tree[0].children![0].title).toBe("专家");
    expect(tree[0].children![0].children!.map((node) => node.title)).toEqual([
      "查看",
      "新增",
    ]);
  });

  it("discards retired module and unknown grants without expanding them", () => {
    expect(
      normalizeTreeSelection(
        ["experts", "unknown", "bridge.view", "bridge.view"],
        catalog,
      ),
    ).toEqual(["bridge.view"]);
    expect(normalizeTreeSelection([], catalog)).toEqual([]);
  });

  it("selects the required view and revokes dependent operations with it", () => {
    const selected = toggleTreeSelection(
      ["users.view"],
      ["bridge.create"],
      true,
      catalog,
    );
    expect(new Set(selected)).toEqual(
      new Set(["users.view", "bridge.view", "bridge.create"]),
    );
    expect(
      toggleTreeSelection(selected, ["bridge.view"], false, catalog),
    ).toEqual(["users.view"]);
  });

  it("removes a branch without touching another branch", () => {
    const branch = buildPermissionTree(catalog, (key) => key)[0];
    const selected = toggleTreeSelection(
      ["users.view"],
      branch.permissionKeys,
      true,
      catalog,
    );
    expect(
      toggleTreeSelection(selected, branch.permissionKeys, false, catalog),
    ).toEqual(["users.view"]);
  });
});
