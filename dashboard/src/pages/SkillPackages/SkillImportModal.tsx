import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Input, Modal, Spin } from "antd";
import { FolderUp } from "lucide-react";
import JSZip from "jszip";
import { useTranslation } from "react-i18next";
import {
  parseSkillZip,
  type ParsedZipSkill,
} from "../Agent/Skills/components/parseSkillZip";
import type { ZipImportSummary } from "../Agent/Skills/components/SkillImportModal";
import styles from "./SkillImportModal.module.less";

type FolderFile = { path: string; file: File };
export async function parseSkillFolder(
  files: FolderFile[],
): Promise<ParsedZipSkill[]> {
  if (files.reduce((size, item) => size + item.file.size, 0) > 64 * 1024 * 1024)
    throw new Error("ZIP_TOO_LARGE");
  const zip = new JSZip();
  for (const { path, file } of files) zip.file(path, file);
  const blob = await zip.generateAsync({ type: "blob" });
  return parseSkillZip(
    new File([blob], "skills.zip", { type: "application/zip" }),
  );
}

async function readDroppedEntry(
  entry: FileSystemEntry,
  prefix = "",
): Promise<FolderFile[]> {
  const path = `${prefix}${entry.name}`;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [{ path, file }];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const result: FolderFile[] = [];
  while (true) {
    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!entries.length) return result;
    for (const child of entries)
      result.push(...(await readDroppedEntry(child, `${path}/`)));
  }
}

export function SkillImportModal({
  open,
  importing,
  onClose,
  onImportUrl,
  onImportZip,
}: {
  open: boolean;
  importing: boolean;
  onClose: () => void;
  onImportUrl: (
    url: string,
    options: { overwrite: boolean },
  ) => Promise<boolean>;
  onImportZip: (
    skills: ParsedZipSkill[],
    options: { overwrite: boolean },
  ) => Promise<ZipImportSummary | false>;
}) {
  const { t } = useTranslation();
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const busy = importing || parsing;
  useEffect(() => {
    if (!open) {
      setError("");
      setDragging(false);
      setUrlMode(false);
      setUrl("");
      setOverwrite(false);
    }
  }, [open]);

  const importFiles = async (files: FolderFile[]) => {
    if (busy || !files.length) return;
    setParsing(true);
    setError("");
    try {
      const skills =
        files.length === 1 && files[0].file.name.toLowerCase().endsWith(".zip")
          ? await parseSkillZip(files[0].file)
          : await parseSkillFolder(files);
      const summary = await onImportZip(skills, { overwrite });
      if (summary && !summary.failed) onClose();
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setError(
        t(
          code === "ZIP_TOO_LARGE"
            ? "skills.zipTooLarge"
            : code === "ZIP_NO_SKILLS"
            ? "skills.zipNoSkills"
            : code === "ZIP_EMPTY"
            ? "skills.zipEmpty"
            : "skills.zipParseFailed",
        ),
      );
    } finally {
      setParsing(false);
    }
  };
  const importUrl = async () => {
    let valid = false;
    try {
      const parsed = new URL(url.trim());
      valid =
        ["https:", "http:"].includes(parsed.protocol) &&
        ["skills.sh", "clawhub.ai", "skillsmp.com", "github.com"].includes(
          parsed.hostname,
        );
    } catch {
      /* Show the URL validation message below. */
    }
    if (!valid) {
      setError(t("skills.invalidSkillUrlSource"));
      return;
    }
    setError("");
    if (await onImportUrl(url.trim(), { overwrite })) onClose();
  };

  return (
    <Modal
      open={open}
      title={t("skills.importSkills")}
      onCancel={() => {
        if (!busy) onClose();
      }}
      width={460}
      centered
      footer={null}
      className={styles.modal}
      maskClosable={!busy}
      closable={!busy}
      keyboard={!busy}
      destroyOnClose
    >
      <input
        type="file"
        hidden
        ref={folderInput}
        multiple
        {...{ webkitdirectory: "", directory: "" }}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).map((file) => ({
            path: file.webkitRelativePath || file.name,
            file,
          }));
          event.target.value = "";
          void importFiles(files);
        }}
      />
      <input
        type="file"
        hidden
        ref={zipInput}
        accept=".zip"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []).map((file) => ({
            path: file.name,
            file,
          }));
          event.target.value = "";
          void importFiles(files);
        }}
      />
      {error && <Alert type="error" message={error} className={styles.error} />}
      {urlMode ? (
        <div className={styles.url}>
          <Input.TextArea
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            autoSize={{ minRows: 3, maxRows: 5 }}
            placeholder={t("skillsCenter.urlPlaceholder")}
            aria-label={t("skills.importFromUrl")}
            disabled={busy}
          />
          <Button
            type="primary"
            loading={busy}
            disabled={!url.trim()}
            onClick={() => void importUrl()}
          >
            {t("skills.importSkills")}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          className={`${styles.dropZone} ${dragging ? styles.dragging : ""}`}
          onClick={() => folderInput.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (busy) return;
            const entries = Array.from(event.dataTransfer.items)
              .map((item) => item.webkitGetAsEntry?.())
              .filter((entry): entry is FileSystemEntry => Boolean(entry));
            if (entries.length) {
              setError("");
              void Promise.all(entries.map((entry) => readDroppedEntry(entry)))
                .then((files) => importFiles(files.flat()))
                .catch(() => setError(t("skills.zipParseFailed")));
            } else
              void importFiles(
                Array.from(event.dataTransfer.files).map((file) => ({
                  path: file.name,
                  file,
                })),
              );
          }}
        >
          {busy ? <Spin /> : <FolderUp size={32} strokeWidth={1.6} />}
          <span>
            {t(
              busy
                ? "skillsCenter.importing"
                : dragging
                ? "skillsCenter.dropNow"
                : "skillsCenter.dropFolder",
            )}
          </span>
        </button>
      )}
      <div className={styles.requirements}>
        <strong>{t("skillsCenter.requirements")}</strong>
        <ul>
          <li>{t("skillsCenter.folderRequirement")}</li>
          <li>{t("skillsCenter.manifestRequirement")}</li>
          <li>{t("skillsCenter.sizeRequirement")}</li>
        </ul>
        <div className={styles.links}>
          {urlMode ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setUrlMode(false)}
            >
              {t("skillsCenter.folderImport")}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => zipInput.current?.click()}
              >
                {t("skillsCenter.pickZip")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setUrlMode(true)}
              >
                {t("skills.importFromUrl")}
              </button>
            </>
          )}
        </div>
        <Checkbox
          checked={overwrite}
          disabled={busy}
          onChange={(event) => setOverwrite(event.target.checked)}
        >
          {t("skills.overwriteExisting")}
        </Checkbox>
      </div>
    </Modal>
  );
}
