export interface TreePermission {
  key: string;
  category: string;
  label: string;
  page?: string;
  page_label?: string;
}

export interface PermissionTreeNode {
  key: string;
  title: string;
  permissionKeys: string[];
  children?: PermissionTreeNode[];
}

export function buildPermissionTree(
  catalog: readonly TreePermission[],
  translate: (key: string) => string,
): PermissionTreeNode[] {
  const roots = ["nav", "settings", "control", "admin"].map((category) => ({
    key: `category:${category}`,
    title: translate(
      category === "nav" ? "adminUsers.permGroupBusiness" : `nav.${category}`,
    ),
    permissionKeys: [] as string[],
    children: [] as PermissionTreeNode[],
  }));
  for (const item of catalog) {
    const module = item.key.split(".")[0];
    if (!item.key.includes(".")) continue;
    const workbench = ["workspace", "terminal", "browser"].includes(module);
    const category = workbench
      ? "control"
      : catalog.find((p) => p.key === `${module}.view`)?.category ??
        item.category;
    const root = roots.find((node) => node.key === `category:${category}`);
    if (!root) continue;
    let parent: PermissionTreeNode = root;
    const page = workbench ? "workbench" : item.page;
    const pageLabel = workbench ? translate("nav.workbench") : item.page_label;
    if (page && pageLabel) {
      const pageKey = `${root.key}:page:${page}`;
      let node = root.children.find((child) => child.key === pageKey);
      if (!node) {
        node = {
          key: pageKey,
          title: pageLabel,
          permissionKeys: [],
          children: [],
        };
        root.children.push(node);
      }
      parent = node;
    }
    const moduleKey = `module:${module}`;
    let branch = parent.children!.find((child) => child.key === moduleKey);
    if (!branch) {
      branch = {
        key: moduleKey,
        title: item.label.split(" · ")[0],
        permissionKeys: [],
        children: [],
      };
      parent.children!.push(branch);
    }
    if (branch.permissionKeys.includes(item.key)) continue;
    branch.children!.push({
      key: item.key,
      title: item.label.split(" · ").slice(1).join(" · ") || item.label,
      permissionKeys: [item.key],
    });
    branch.permissionKeys.push(item.key);
    root.permissionKeys.push(item.key);
    if (parent !== root) parent.permissionKeys.push(item.key);
  }
  return roots.filter((root) => root.permissionKeys.length > 0);
}

export function normalizeTreeSelection(
  value: readonly string[],
  catalog: readonly TreePermission[],
): string[] {
  const valid = new Set(
    catalog.filter((item) => item.key.includes(".")).map((item) => item.key),
  );
  return [...new Set(value.filter((key) => valid.has(key)))];
}

export function toggleTreeSelection(
  selected: readonly string[],
  keys: readonly string[],
  checked: boolean,
  catalog: readonly TreePermission[],
): string[] {
  const next = new Set(selected);
  for (const key of keys) {
    if (checked) {
      next.add(key);
      const view = `${key.split(".")[0]}.view`;
      if (catalog.some((item) => item.key === view)) next.add(view);
    } else {
      next.delete(key);
      if (key.endsWith(".view")) {
        for (const held of next)
          if (held.startsWith(`${key.split(".")[0]}.`)) next.delete(held);
      }
    }
  }
  return [...next];
}
