import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicResourcesPage from ".";

const mocks = vi.hoisted(() => ({
  user: { role: "admin" },
  list: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => mocks.user,
}));
vi.mock("../../../api/modules/publicResources", () => ({
  publicResourcesApi: mocks,
}));
vi.mock("../../../layouts/PageShell", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("../../../components/ForbiddenPage", () => ({
  default: () => <div>Forbidden</div>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) =>
      values?.name ? `${key} ${values.name}` : key,
  }),
}));

const seed = [
  {
    resource_type: "builtin_skill",
    resource_id: "alpha",
    category: "skills",
    name: "Alpha",
    description: "Preset skill",
    enabled: true,
  },
  {
    resource_type: "package_skill",
    resource_id: "pkg/beta",
    category: "skills",
    name: "Beta",
    description: "Public package",
    enabled: true,
  },
  {
    resource_type: "expert_template",
    resource_id: "expert",
    category: "experts",
    name: "Expert",
    description: "Public expert",
    enabled: true,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { role: "admin" };
  let rows = seed.map((row) => ({ ...row }));
  mocks.list.mockImplementation(async () => rows);
  mocks.update.mockImplementation(
    async (source: string, ids: string[], enabled: boolean) => {
      rows = rows.map((row) =>
        row.resource_type === source && ids.includes(row.resource_id)
          ? { ...row, enabled }
          : row,
      );
    },
  );
});

function openPage() {
  return render(
    <MemoryRouter initialEntries={["/admin/public-resources?tab=skills"]}>
      <PublicResourcesPage />
    </MemoryRouter>,
  );
}

describe("platform public resource management", () => {
  it("does not load or show publication controls for an ordinary user", () => {
    mocks.user = { role: "user" };
    openPage();
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("withdraws and republishes a single resource through the admin API", async () => {
    openPage();
    const toggle = await screen.findByRole("switch", {
      name: "publicResources.toggle Alpha",
    });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        "builtin_skill",
        ["alpha"],
        false,
      ),
    );
    await waitFor(() => expect(toggle).not.toBeChecked());
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(mocks.update).toHaveBeenLastCalledWith(
        "builtin_skill",
        ["alpha"],
        true,
      ),
    );
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it("limits batch operations to the selected category and filtered rows", async () => {
    openPage();
    await screen.findByText("Alpha");
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Alpha" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "publicResources.disableVisible" }),
    );
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        "builtin_skill",
        ["alpha"],
        false,
      ),
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
