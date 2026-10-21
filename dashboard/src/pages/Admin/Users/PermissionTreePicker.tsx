import { useMemo } from "react";
import { Tree, Typography } from "antd";
import { useTranslation } from "react-i18next";
import {
  buildPermissionTree,
  normalizeTreeSelection,
  toggleTreeSelection,
  type TreePermission,
  type PermissionTreeNode,
} from "./permissionTree";
import styles from "./PermissionTreePicker.module.less";

export function PermissionCheckboxPicker({
  value = [],
  onChange,
  catalog,
  disabled,
}: {
  value?: string[];
  onChange?: (value: string[]) => void;
  catalog: TreePermission[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const tree = useMemo(() => buildPermissionTree(catalog, t), [catalog, t]);
  const selected = useMemo(
    () => normalizeTreeSelection(value, catalog),
    [value, catalog],
  );
  const nodes = new Map<string, PermissionTreeNode>();
  const visit = (items: PermissionTreeNode[]) => {
    for (const node of items) {
      nodes.set(node.key, node);
      if (node.children) visit(node.children);
    }
  };
  visit(tree);
  const held = new Set(selected);
  const checked: string[] = [];
  const halfChecked: string[] = [];
  for (const node of nodes.values()) {
    const count = node.permissionKeys.filter((key) => held.has(key)).length;
    if (count === node.permissionKeys.length) checked.push(node.key);
    else if (count > 0) halfChecked.push(node.key);
  }
  if (tree.length === 0)
    return (
      <Typography.Text type="secondary">
        {t("adminUsers.permCatalogEmpty")}
      </Typography.Text>
    );
  return (
    <div className={styles.tree}>
      <Tree
        checkable
        checkStrictly
        selectable={false}
        blockNode
        disabled={disabled}
        showLine={{ showLeafIcon: false }}
        treeData={tree}
        defaultExpandedKeys={tree.map((node) => node.key)}
        checkedKeys={{ checked, halfChecked }}
        onCheck={(_, info) => {
          if (disabled) return;
          const node = nodes.get(String(info.node.key));
          if (node)
            onChange?.(
              toggleTreeSelection(
                selected,
                node.permissionKeys,
                info.checked,
                catalog,
              ),
            );
        }}
      />
    </div>
  );
}
