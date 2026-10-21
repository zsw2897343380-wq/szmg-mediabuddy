import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PermissionCheckboxPicker } from "./PermissionTreePicker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const catalog = [
  { key: "bridge.view", category: "settings", label: "云端协同 · 查看" },
  { key: "bridge.create", category: "settings", label: "云端协同 · 新增" },
];

describe("permission tree picker", () => {
  it("renders an expandable tree and checks a function as a group", () => {
    const onChange = vi.fn();
    render(<PermissionCheckboxPicker catalog={catalog} onChange={onChange} />);
    expect(screen.getByRole("tree")).toBeVisible();
    const branch = screen.getByText("云端协同").closest(".ant-tree-treenode")!;
    fireEvent.click(branch.querySelector(".ant-tree-checkbox")!);
    expect(new Set(onChange.mock.calls[0][0])).toEqual(
      new Set(["bridge.view", "bridge.create"]),
    );
    fireEvent.click(branch.querySelector(".ant-tree-switcher")!);
    expect(screen.getByText("新增")).toBeVisible();
  });

  it("does not allow a disabled picker to change permissions", () => {
    const onChange = vi.fn();
    render(
      <PermissionCheckboxPicker
        catalog={catalog}
        disabled
        onChange={onChange}
      />,
    );
    const branch = screen.getByText("云端协同").closest(".ant-tree-treenode")!;
    fireEvent.click(branch.querySelector(".ant-tree-checkbox")!);
    expect(onChange).not.toHaveBeenCalled();
  });
});
