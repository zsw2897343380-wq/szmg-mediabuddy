import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import RequirePermission from "../../components/RequirePermission";
import CapabilityCenter from "./index";
import { CapabilityHeaderActions } from "./HeaderActions";

const state = vi.hoisted(() => ({
  user: { role: "admin", permissions: [] as string[] },
}));
vi.mock("../../hooks/useCurrentUser", () => ({
  useCurrentUser: () => state.user,
}));
vi.mock("../../context/AgentContext", () => ({
  useAgent: () => ({ activeAgentId: "agent-one" }),
}));
vi.mock("../../components/AgentSelector", () => ({
  default: () => <div>expert-selector</div>,
}));
vi.mock("../../components/ForbiddenPage", () => ({
  default: () => <div>forbidden</div>,
}));
vi.mock("../Experts", () => ({
  default: function ExpertPanel() {
    const [text, setText] = useState("");
    return (
      <>
        <CapabilityHeaderActions resource="experts">
          <button>expert-action</button>
        </CapabilityHeaderActions>
        <input
          aria-label="expert-filter"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </>
    );
  },
}));
vi.mock("../Agent/Skills/components/SkillsTabs", () => ({
  default: ({ agentId }: { agentId: string }) => <div>skills-{agentId}</div>,
}));
vi.mock("../SkillPackages", () => ({
  default: ({ unified }: { unified?: boolean }) => (
    <>
      {unified && (
        <Link to="/skill-packages">capabilityCenter.skillPackages</Link>
      )}
      <input aria-label={unified ? "library-draft" : "package-draft"} />
    </>
  ),
}));
vi.mock("../Agent/Connectors", () => ({
  default: function ConnectorPanel() {
    const { search } = useLocation();
    return (
      <>
        <input aria-label="connector-draft" />
        <span>{search}</span>
      </>
    );
  },
}));

function setup(path = "/experts") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <RequirePermission>
              <CapabilityCenter />
            </RequirePermission>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function openTab(name: string) {
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "capabilityCenter.title" }),
    ).getByRole("link", { name }),
  );
}

beforeEach(() => {
  state.user = { role: "admin", permissions: [] };
});

describe("combined capability center", () => {
  it("switches real panels while keeping expert filters and connector drafts", async () => {
    setup();
    fireEvent.change(
      await screen.findByRole("textbox", { name: "expert-filter" }),
      { target: { value: "my expert" } },
    );
    openTab("nav.skills");
    expect(
      await screen.findByRole("textbox", { name: "library-draft" }),
    ).toBeVisible();
    expect(screen.queryByText("expert-selector")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "expert-action" }),
    ).not.toBeInTheDocument();
    openTab("nav.connectors");
    fireEvent.change(
      await screen.findByRole("textbox", { name: "connector-draft" }),
      { target: { value: "unsaved" } },
    );
    openTab("nav.experts");
    expect(screen.getByRole("button", { name: "expert-action" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "expert-filter" })).toHaveValue(
      "my expert",
    );
    openTab("nav.connectors");
    expect(
      screen.getByRole("textbox", { name: "connector-draft" }),
    ).toHaveValue("unsaved");
  });

  it("keeps the skill-package view and draft when switching top-level tabs", async () => {
    setup("/skills");
    fireEvent.click(
      await screen.findByRole("link", {
        name: "capabilityCenter.skillPackages",
      }),
    );
    fireEvent.change(
      await screen.findByRole("textbox", { name: "package-draft" }),
      { target: { value: "package name" } },
    );
    openTab("nav.connectors");
    await screen.findByRole("textbox", { name: "connector-draft" });
    openTab("nav.skills");
    expect(screen.getByRole("textbox", { name: "package-draft" })).toHaveValue(
      "package name",
    );
  });

  it("hides restricted resources for a user without their permissions", async () => {
    state.user = { role: "user", permissions: ["skills"] };
    setup("/skills");
    expect(await screen.findByText("skills-agent-one")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "nav.connectors" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "capabilityCenter.skillPackages" }),
    ).not.toBeInTheDocument();
  });

  it("opens the unified library for package-only users without an expert", async () => {
    state.user = { role: "user", permissions: ["skill_packages"] };
    setup("/skills");
    expect(
      await screen.findByRole("textbox", { name: "library-draft" }),
    ).toBeVisible();
    expect(screen.queryByText("expert-selector")).not.toBeInTheDocument();
    expect(screen.queryByText("skills-agent-one")).not.toBeInTheDocument();
  });

  it("does not mount skills or experts for connector-only users", async () => {
    state.user = { role: "user", permissions: ["connectors"] };
    setup("/connectors");
    await screen.findByRole("textbox", { name: "connector-draft" });
    expect(
      screen.queryByRole("link", { name: "nav.skills" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "expert-filter" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("skills-agent-one")).not.toBeInTheDocument();
  });

  it("rejects a direct skill URL without permission", () => {
    state.user = { role: "user", permissions: [] };
    setup("/skills");
    expect(screen.getByText("forbidden")).toBeVisible();
  });

  it("rejects a direct connector URL without permission", () => {
    state.user = { role: "user", permissions: [] };
    setup("/connectors?oauth_state=example");
    expect(screen.getByText("forbidden")).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: "connector-draft" }),
    ).not.toBeInTheDocument();
  });

  it("preserves OAuth callback parameters on the existing connector URL", async () => {
    setup("/connectors?oauth_state=example");
    expect(await screen.findByText("?oauth_state=example")).toBeVisible();
  });
});
