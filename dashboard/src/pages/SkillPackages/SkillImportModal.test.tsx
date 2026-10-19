import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSkillFolder, SkillImportModal } from "./SkillImportModal";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const getComputedStyle = window.getComputedStyle.bind(window);
beforeEach(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyle(element),
  );
});
afterEach(() => vi.mocked(window.getComputedStyle).mockRestore());

describe("WorkBuddy skill folder import", () => {
  it("keeps the skill folder name and its supporting files", async () => {
    const result = await parseSkillFolder([
      {
        path: "writer/SKILL.md",
        file: new File(["---\nname: writer\n---\nWrite drafts"], "SKILL.md"),
      },
      { path: "writer/scripts/run.py", file: new File(["print(1)"], "run.py") },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("writer");
    expect(result[0].files.map((file) => file.path).sort()).toEqual([
      "SKILL.md",
      "scripts/run.py",
    ]);
    expect(
      atob(
        result[0].files.find((file) => file.path === "scripts/run.py")!
          .contentBase64,
      ),
    ).toBe("print(1)");
  });
  it("rejects a folder without a manifest and oversized folder content", async () => {
    await expect(
      parseSkillFolder([
        { path: "writer/notes.txt", file: new File(["notes"], "notes.txt") },
      ]),
    ).rejects.toThrow("ZIP_NO_SKILLS");
    const oversized = new File(["content"], "SKILL.md");
    Object.defineProperty(oversized, "size", { value: 65 * 1024 * 1024 });
    await expect(
      parseSkillFolder([{ path: "writer/SKILL.md", file: oversized }]),
    ).rejects.toThrow("ZIP_TOO_LARGE");
  });
  it("imports a selected ZIP and keeps the dialog open after a partial failure", async () => {
    const zip = new JSZip();
    zip.file("writer/SKILL.md", "---\nname: writer\n---\nWrite drafts");
    const blob = await zip.generateAsync({ type: "blob" });
    const onClose = vi.fn();
    const onImportZip = vi
      .fn()
      .mockResolvedValue({ imported: 0, skipped: 0, failed: 1 });
    const { container } = render(
      <SkillImportModal
        open
        importing={false}
        onClose={onClose}
        onImportUrl={vi.fn()}
        onImportZip={onImportZip}
      />,
    );
    expect(
      screen.getByRole("button", { name: "skillsCenter.dropFolder" }),
    ).toBeInTheDocument();
    const zipInput = container.ownerDocument.querySelector(
      'input[type="file"][accept=".zip"]',
    )!;
    fireEvent.change(zipInput, {
      target: {
        files: [new File([blob], "writer.zip", { type: "application/zip" })],
      },
    });
    await waitFor(() =>
      expect(onImportZip).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ slug: "writer" })]),
        { overwrite: false },
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
