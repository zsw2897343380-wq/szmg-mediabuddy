import { beforeEach, describe, expect, it, vi } from "vitest";

const { request, requestBlob } = vi.hoisted(() => ({
  request: vi.fn(),
  requestBlob: vi.fn(),
}));

vi.mock("../request", () => ({ request, requestBlob }));

import { skillPackagesApi } from "./skillPackages";
import { SKILLS_UPDATED } from "../../utils/skillsEvents";

beforeEach(() => {
  request.mockClear();
});

describe("skillPackagesApi", () => {
  it("refreshes skill pickers only after a successful personal library change", async () => {
    const listener = vi.fn();
    window.addEventListener(SKILLS_UPDATED, listener);
    request.mockResolvedValueOnce({
      installed_package_ids: ["pkg-1"],
      disabled_package_ids: [],
    });
    await skillPackagesApi.updateLibrary("pkg-1", true);
    expect(request).toHaveBeenLastCalledWith("/skill-packages/library/pkg-1", {
      method: "PUT",
      body: JSON.stringify({ installed: true, enabled: true }),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    request.mockRejectedValueOnce(new Error("failure"));
    await expect(
      skillPackagesApi.updateLibrary("pkg-1", true, false),
    ).rejects.toThrow("failure");
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SKILLS_UPDATED, listener);
  });

  it("changes one skill without installing its package and refreshes chat pickers", async () => {
    request.mockResolvedValueOnce({
      installed_package_ids: [],
      disabled_package_ids: [],
      skill_states: {
        "package one": { "skill/name": { installed: true, enabled: false } },
      },
    });
    const listener = vi.fn();
    window.addEventListener(SKILLS_UPDATED, listener);
    const result = await skillPackagesApi.updateSkillLibrary(
      "package one",
      "skill/name",
      true,
      false,
    );
    expect(request).toHaveBeenLastCalledWith(
      "/skill-packages/library/package%20one/skills/skill%2Fname",
      {
        method: "PUT",
        body: JSON.stringify({ installed: true, enabled: false }),
      },
    );
    expect(result.installed_package_ids).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SKILLS_UPDATED, listener);
  });

  it("exports one skill separately while retaining package export compatibility", () => {
    skillPackagesApi.exportPackage("package one", "reader skill");
    expect(requestBlob).toHaveBeenLastCalledWith(
      "/skill-packages/package%20one/export?skill_slug=reader%20skill",
    );
    skillPackagesApi.exportPackage("package one");
    expect(requestBlob).toHaveBeenLastCalledWith(
      "/skill-packages/package%20one/export",
    );
  });

  it("uses the agent package mount endpoints", () => {
    skillPackagesApi.listMounted("agent-1");
    skillPackagesApi.replaceMounted("agent-1", ["pkg-1", "pkg-2"]);

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/agents/agent-1/skill-packages",
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/agents/agent-1/skill-packages",
      {
        method: "PUT",
        body: JSON.stringify({ package_ids: ["pkg-1", "pkg-2"] }),
      },
    );
  });

  it("uses the package copy and push endpoints", () => {
    skillPackagesApi.listWritable();
    skillPackagesApi.copyToWorkspace("agent-1", "pkg-1", {
      skill_slugs: ["reader", "writer"],
      overwrite: true,
    });
    skillPackagesApi.pushFromWorkspace("agent-1", "reader skill", {
      package_id: "pkg-1",
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "/skill-packages?writable_only=true",
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      "/agents/agent-1/skill-packages/pkg-1/copy",
      {
        method: "POST",
        body: JSON.stringify({
          skill_slugs: ["reader", "writer"],
          overwrite: true,
        }),
      },
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      "/agents/agent-1/skills/reader%20skill/push-to-package",
      {
        method: "POST",
        body: JSON.stringify({ package_id: "pkg-1" }),
      },
    );
  });

  it("uses the package and nested skill endpoints", () => {
    skillPackagesApi.create({ name: "starter", description: "Starter skills" });
    skillPackagesApi.update("pkg-1", { name: "renamed" });
    skillPackagesApi.fromSkillHub({
      slug: "starter",
      icon_name: "sparkles",
    });
    skillPackagesApi.createSkill("pkg-1", {
      name: "hello",
      content: "---\nname: hello\n---\n",
    });
    skillPackagesApi.updateSkill("pkg-1", "hello", { content: "# Hello" });
    skillPackagesApi.deleteSkill("pkg-1", "hello");

    expect(request).toHaveBeenNthCalledWith(1, "/skill-packages", {
      method: "POST",
      body: JSON.stringify({
        name: "starter",
        description: "Starter skills",
      }),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/skill-packages/pkg-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "renamed" }),
    });
    expect(request).toHaveBeenNthCalledWith(
      3,
      "/skill-packages/from-skillhub",
      {
        method: "POST",
        body: JSON.stringify({
          slug: "starter",
          icon_name: "sparkles",
        }),
      },
    );
    expect(request).toHaveBeenNthCalledWith(4, "/skill-packages/pkg-1/skills", {
      method: "POST",
      body: JSON.stringify({
        name: "hello",
        content: "---\nname: hello\n---\n",
      }),
    });
    expect(request).toHaveBeenNthCalledWith(
      5,
      "/skill-packages/pkg-1/skills/hello",
      {
        method: "PUT",
        body: JSON.stringify({ content: "# Hello" }),
      },
    );
    expect(request).toHaveBeenNthCalledWith(
      6,
      "/skill-packages/pkg-1/skills/hello",
      { method: "DELETE" },
    );
  });
});
