import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Spin,
  Switch,
  Tooltip,
} from "antd";
import {
  ArrowLeft,
  Check,
  Download,
  FileCode2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authApi, type OctopUser } from "../../api/modules/auth";
import { skillPackagesApi } from "../../api/modules/skillPackages";
import type {
  SkillPackageDetail,
  SkillPackageSkill,
  SkillPackageSkillDetail,
  UserSkillLibrary,
} from "../../api/types/skillPackage";
import Markdown from "../../components/Markdown/LazyMarkdown";
import PageShell from "../../layouts/PageShell";
import { CapabilityHeaderActions } from "../CapabilityCenter/HeaderActions";
import { apiErrorMessage, parseApiError } from "../../utils/apiError";
import { message } from "../../utils/antdMessage";
import { saveBlobAsFile } from "../../utils/saveBlobAsFile";
import { showConfirmModal } from "../../utils/confirmModal";
import {
  SkillDrawer,
  type SkillFormValues,
} from "../Agent/Skills/components/SkillDrawer";
import type { ZipImportSummary } from "../Agent/Skills/components/SkillImportModal";
import { SkillImportModal } from "./SkillImportModal";
import type { ParsedZipSkill } from "../Agent/Skills/components/parseSkillZip";
import type { SkillHubSkill } from "../Agent/Skills/components/SkillHubDetailDrawer";
import styles from "./UnifiedSkillLibrary.module.less";

type LocalSkill = { skill: SkillPackageSkill; pkg: SkillPackageDetail };
type Selection =
  | { kind: "local"; item: LocalSkill }
  | { kind: "market"; skill: SkillHubSkill };
type Catalog = "recommended" | "trending" | "hot" | "newest" | "local";
const RANKINGS = ["recommended", "trending", "hot", "newest"] as const;

function normalizeHubSkill(raw: Record<string, unknown>): SkillHubSkill {
  const slug = String(raw.slug ?? raw.name ?? "");
  return {
    ...(raw as unknown as SkillHubSkill),
    slug,
    name: String(raw.name ?? raw.display_name_zh ?? raw.display_name ?? slug),
    description: String(raw.description ?? ""),
    iconUrl: (raw.iconUrl ?? raw.icon_url) as string | undefined,
  };
}

function SkillIcon({
  skill,
}: {
  skill: Pick<SkillPackageSkill, "icon_url" | "emoji">;
}) {
  return (
    <span className={styles.icon}>
      {skill.icon_url ? (
        <img src={skill.icon_url} alt="" />
      ) : skill.emoji ? (
        <span>{skill.emoji}</span>
      ) : (
        <FileCode2 size={24} strokeWidth={1.6} />
      )}
    </span>
  );
}

export default function UnifiedSkillLibrary({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [packages, setPackages] = useState<SkillPackageDetail[]>([]);
  const [library, setLibrary] = useState<UserSkillLibrary>({
    installed_package_ids: [],
    disabled_package_ids: [],
  });
  const [user, setUser] = useState<OctopUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mine, setMine] = useState(false);
  const [catalog, setCatalog] = useState<Catalog>("recommended");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [hideInstalled, setHideInstalled] = useState(false);
  const [rankings, setRankings] = useState<Record<string, SkillHubSkill[]>>({});
  const [market, setMarket] = useState<SkillHubSkill[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [marketRevision, setMarketRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detail, setDetail] = useState<SkillPackageSkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [overviewQuery, setOverviewQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [skillForm] = Form.useForm<SkillFormValues>();
  const detailRequest = useRef(0);
  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const [rows, nextLibrary, currentUser] = await Promise.all([
        skillPackagesApi.list(),
        skillPackagesApi.library(),
        authApi.me(),
      ]);
      const details = await Promise.all(
        rows.map((row) => skillPackagesApi.get(row.id)),
      );
      setPackages(details);
      setLibrary(nextLibrary);
      setUser(currentUser);
    } catch (error) {
      setLoadError(apiErrorMessage(error, t("skillPackages.loadFailed"), t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (pathname === "/skills") void refresh();
  }, [refresh, pathname]);
  useEffect(() => {
    if (searchParams.get("import") !== "1") return;
    setImportOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("import");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (mine || catalog === "local") return;
    let current = true;
    const timer = setTimeout(
      () => {
        setMarketLoading(true);
        setMarketError("");
        const request = query.trim()
          ? skillPackagesApi
              .hubSearch(query.trim())
              .then((rows) => ({ search: rows.map(normalizeHubSkill) }))
          : skillPackagesApi.hubRankings().then((response) => {
              const data = response as {
                rankings?: Record<
                  string,
                  { skills?: Record<string, unknown>[] }
                >;
                errors?: Record<string, string>;
              };
              if (Object.keys(data.errors ?? {}).length)
                throw new Error(Object.values(data.errors!)[0]);
              return {
                rankings: Object.fromEntries(
                  Object.entries(data.rankings ?? {}).map(([key, value]) => [
                    key,
                    (value.skills ?? []).map(normalizeHubSkill),
                  ]),
                ),
              };
            });
        void request
          .then((result) => {
            if (!current) return;
            if ("search" in result) setMarket(result.search);
            else setRankings(result.rankings);
          })
          .catch((error) => {
            if (current)
              setMarketError(
                apiErrorMessage(error, t("skillsCenter.marketFailed"), t),
              );
          })
          .finally(() => {
            if (current) setMarketLoading(false);
          });
      },
      query.trim() ? 350 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [catalog, mine, query, marketRevision, t]);

  const localSkills = useMemo(
    () =>
      packages.flatMap((pkg) => pkg.skills.map((skill) => ({ skill, pkg }))),
    [packages],
  );
  const isInstalled = (item: LocalSkill) =>
    library.skill_states?.[item.pkg.id]?.[item.skill.slug]?.installed ??
    library.installed_package_ids.includes(item.pkg.id);
  const isEnabled = (item: LocalSkill) =>
    library.skill_states?.[item.pkg.id]?.[item.skill.slug]?.enabled ??
    (isInstalled(item) && !library.disabled_package_ids.includes(item.pkg.id));
  const canWrite = (pkg: SkillPackageDetail) =>
    pkg.can_write ??
    Boolean(
      user && (user.role === "admin" || pkg.created_by === String(user.id)),
    );
  const installedSkills = localSkills.filter((item) => isInstalled(item));
  const installedMatch = (skill: SkillHubSkill) =>
    installedSkills.find((item) => item.skill.slug === skill.slug);
  const marketSkills = Array.from(
    new Map(
      (query.trim() ? market : rankings[catalog] ?? []).map((skill) => [
        skill.slug,
        skill,
      ]),
    ).values(),
  );
  const categories =
    mine || catalog === "local"
      ? packages
          .filter(
            (pkg) =>
              !mine || installedSkills.some((item) => item.pkg.id === pkg.id),
          )
          .map((pkg) => ({ id: pkg.id, name: pkg.name }))
      : [
          ...new Set(
            marketSkills
              .map((skill) => skill.category)
              .filter((value): value is string => Boolean(value)),
          ),
        ].map((name) => ({ id: name, name }));
  const visibleLocal = (mine ? installedSkills : localSkills).filter(
    (item) =>
      (!category || item.pkg.id === category) &&
      (!query.trim() ||
        `${item.skill.name} ${item.skill.description} ${item.pkg.name}`
          .toLocaleLowerCase()
          .includes(query.trim().toLocaleLowerCase())) &&
      (mine || !hideInstalled || !isInstalled(item)),
  );
  const visibleMarket = marketSkills.filter(
    (skill) =>
      (!category || skill.category === category) &&
      (!hideInstalled || !installedMatch(skill)),
  );

  const updateLibrary = async (
    item: LocalSkill,
    installed: boolean,
    enabled = true,
  ) => {
    if (busy) return;
    setBusy(`${item.pkg.id}/${item.skill.slug}`);
    try {
      setLibrary(
        await skillPackagesApi.updateSkillLibrary(
          item.pkg.id,
          item.skill.slug,
          installed,
          enabled,
        ),
      );
    } catch (error) {
      message.error(apiErrorMessage(error, t("skillLibrary.updateFailed"), t));
    } finally {
      setBusy(null);
    }
  };

  const openLocal = async (item: LocalSkill) => {
    const request = ++detailRequest.current;
    setSelection({ kind: "local", item });
    setDetail(null);
    setOverviewQuery("");
    setDetailLoading(true);
    try {
      const next = await skillPackagesApi.getSkill(
        item.pkg.id,
        item.skill.slug,
      );
      if (detailRequest.current === request) setDetail(next);
    } catch (error) {
      if (detailRequest.current === request)
        message.error(apiErrorMessage(error, t("skillPackages.loadFailed"), t));
    } finally {
      if (detailRequest.current === request) setDetailLoading(false);
    }
  };
  const closeDetail = () => {
    ++detailRequest.current;
    setSelection(null);
    setDetailLoading(false);
  };
  const openMarket = (skill: SkillHubSkill) => {
    ++detailRequest.current;
    setSelection({ kind: "market", skill });
    setDetail(null);
    setOverviewQuery("");
    setDetailLoading(false);
  };
  const confirmRemove = (item: LocalSkill) =>
    showConfirmModal({
      title: t("skillsCenter.removeConfirm", { name: item.skill.name }),
      okText: t("skillLibrary.uninstall"),
      cancelText: t("common.cancel"),
      onOk: () => updateLibrary(item, false),
    });

  const removeEmptyImport = async (packageId: string) => {
    try {
      const pkg = await skillPackagesApi.get(packageId);
      if (pkg.skills.length === 0) await skillPackagesApi.delete(packageId);
    } catch {
      // Preserve the import error if the server is also unavailable for cleanup.
    }
  };

  const importUrl = async (
    url: string,
    options: { overwrite: boolean },
  ): Promise<boolean> => {
    if (importing) return false;
    setImporting(true);
    let pkg: SkillPackageDetail | undefined;
    try {
      const name = decodeURIComponent(
        new URL(url).pathname.split("/").filter(Boolean).at(-1) ||
          t("skillsCenter.importedSkill"),
      );
      pkg = await skillPackagesApi.create({ name });
      const imported = await skillPackagesApi.importSkill(pkg.id, {
        bundle_url: url,
        overwrite: options.overwrite,
      });
      setLibrary(
        await skillPackagesApi.updateSkillLibrary(pkg.id, imported.slug, true),
      );
      await refresh();
      setMine(true);
      setCategory("");
      message.success(t("skills.importSuccess"));
      return true;
    } catch (error) {
      if (pkg) {
        await removeEmptyImport(pkg.id);
        await refresh();
      }
      message.error(apiErrorMessage(error, t("skills.importFailed"), t));
      return false;
    } finally {
      setImporting(false);
    }
  };

  const importZip = async (
    skills: ParsedZipSkill[],
    options: { overwrite: boolean },
  ): Promise<ZipImportSummary | false> => {
    if (importing) return false;
    setImporting(true);
    const summary = { imported: 0, skipped: 0, failed: 0 };
    try {
      for (const skill of skills) {
        let createdPackageId: string | undefined;
        try {
          const existing = localSkills.find(
            (item) => item.skill.slug === skill.slug && canWrite(item.pkg),
          );
          const pkg =
            existing?.pkg ??
            (await skillPackagesApi.create({ name: skill.slug }));
          if (!existing) createdPackageId = pkg.id;
          await skillPackagesApi.createSkill(pkg.id, {
            name: skill.slug,
            files: skill.files.map((file) => ({
              path: file.path,
              content_base64: file.contentBase64,
            })),
            overwrite: options.overwrite,
          });
          setLibrary(
            await skillPackagesApi.updateSkillLibrary(pkg.id, skill.slug, true),
          );
          summary.imported += 1;
        } catch (error) {
          if (createdPackageId) await removeEmptyImport(createdPackageId);
          if (parseApiError(error)?.code === "SKILL_ALREADY_EXISTS")
            summary.skipped += 1;
          else summary.failed += 1;
        }
      }
      await refresh();
      if (summary.imported) {
        setMine(true);
        setCategory("");
      }
      message[summary.failed ? "warning" : "success"](
        t("skills.zipImportSummary", summary),
      );
      return summary;
    } finally {
      setImporting(false);
    }
  };

  const installMarket = async (skill: SkillHubSkill) => {
    if (busy) return;
    const existing = localSkills.find((item) => item.skill.slug === skill.slug);
    if (existing) {
      await updateLibrary(existing, true);
      return;
    }
    setBusy(`market:${skill.slug}`);
    let createdPackageId: string | undefined;
    try {
      const pkg = await skillPackagesApi.create({
        name: skill.name,
        description: skill.description_zh || skill.description,
      });
      createdPackageId = pkg.id;
      const result = await skillPackagesApi.hubInstall(pkg.id, {
        skill_name: skill.slug,
        display_name: skill.name,
        icon_url: skill.iconUrl ?? undefined,
      });
      if (!result.installed) throw new Error(t("skills.installFailed"));
      setLibrary(
        await skillPackagesApi.updateSkillLibrary(pkg.id, result.name, true),
      );
      await refresh();
      message.success(t("skills.installSuccess"));
    } catch (error) {
      if (createdPackageId) await removeEmptyImport(createdPackageId);
      message.error(apiErrorMessage(error, t("skills.installFailed"), t));
    } finally {
      setBusy(null);
    }
  };

  const exportLocal = async (item: LocalSkill) => {
    try {
      await saveBlobAsFile(
        await skillPackagesApi.exportPackage(item.pkg.id, item.skill.slug),
        `${item.skill.slug}.zip`,
      );
    } catch (error) {
      message.error(apiErrorMessage(error, t("skills.exportSkillFailed"), t));
    }
  };
  const editLocal = () => {
    if (!detail) return;
    skillForm.setFieldsValue({
      name: detail.slug,
      description: detail.description,
      body: detail.body,
      content: detail.raw,
    });
    setEditorOpen(true);
  };
  const saveLocal = async (values: SkillFormValues) => {
    if (selection?.kind !== "local") return;
    const { item } = selection;
    try {
      await skillPackagesApi.updateSkill(item.pkg.id, item.skill.slug, {
        content: values.content,
      });
      setEditorOpen(false);
      await refresh();
      await openLocal(item);
      message.success(t("skillPackages.skillSaved"));
    } catch (error) {
      message.error(apiErrorMessage(error, t("skillPackages.saveFailed"), t));
    }
  };
  const selectedLocal =
    selection?.kind === "local"
      ? isInstalled(selection.item)
        ? selection.item
        : undefined
      : selection?.kind === "market"
      ? installedMatch(selection.skill)
      : undefined;
  const selectedSkill =
    selection?.kind === "local" ? selection.item.skill : selection?.skill;
  const selectedDescription =
    selection?.kind === "market" && i18n.language.startsWith("zh")
      ? selection.skill.description_zh || selection.skill.description
      : selectedSkill?.description;
  const preview = detail?.body || selectedDescription || "";
  const overviewMatches = overviewQuery
    ? preview.toLocaleLowerCase().split(overviewQuery.toLocaleLowerCase())
        .length - 1
    : 0;

  return (
    <PageShell embedded={embedded} title={t("nav.skills")} fill>
      <div className={styles.page}>
        <CapabilityHeaderActions resource="skills">
          <div className={styles.toolbarActions}>
            {user?.role === "admin" && (
              <Button
                onClick={() => navigate("/admin/public-resources?tab=skills")}
              >
                {t("nav.publicResources")}
              </Button>
            )}
            {!mine && (
              <Button
                onClick={() => {
                  setMine(true);
                  setCategory("");
                  setQuery("");
                }}
              >
                {t("skillLibrary.title")}{" "}
                <span className={styles.count}>{installedSkills.length}</span>
              </Button>
            )}
            <Button
              onClick={() => setImportOpen(true)}
              icon={<Plus size={16} />}
            >
              {t("skills.importSkills")}
            </Button>
            <Input
              className={styles.search}
              prefix={<Search size={16} />}
              placeholder={t("skillsCenter.search")}
              aria-label={t("skillsCenter.search")}
              value={query}
              allowClear
              onChange={(event) => setQuery(event.target.value)}
            />
            <Tooltip title={t("common.refresh")}>
              <Button
                type="text"
                icon={<RefreshCw size={15} />}
                aria-label={t("common.refresh")}
                onClick={() => {
                  void refresh();
                  setMarketRevision((value) => value + 1);
                }}
              />
            </Tooltip>
          </div>
        </CapabilityHeaderActions>
        {mine && (
          <div className={styles.toolbar}>
            <div className={styles.heading}>
              <button
                type="button"
                className={styles.back}
                onClick={() => {
                  setMine(false);
                  setCategory("");
                  setQuery("");
                }}
                aria-label={t("skillsCenter.backToMarket")}
              >
                <ArrowLeft size={18} />
              </button>
              <h2>{t("skillLibrary.title")}</h2>
              <span className={styles.count}>{installedSkills.length}</span>
            </div>
          </div>
        )}
        <div className={styles.scroll}>
          {!mine && (
            <div
              className={styles.tabs}
              role="tablist"
              aria-label={t("skillsCenter.catalog")}
            >
              {RANKINGS.map((key) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={catalog === key}
                  className={catalog === key ? styles.activeTab : ""}
                  key={key}
                  onClick={() => {
                    setCatalog(key);
                    setCategory("");
                  }}
                >
                  {t(`skills.ranking${key[0].toUpperCase()}${key.slice(1)}`)}
                </button>
              ))}
              <button
                type="button"
                role="tab"
                aria-selected={catalog === "local"}
                className={catalog === "local" ? styles.activeTab : ""}
                onClick={() => {
                  setCatalog("local");
                  setCategory("");
                }}
              >
                {t("skillsCenter.instance")}
              </button>
              <Checkbox
                className={styles.hideInstalled}
                checked={hideInstalled}
                onChange={(event) => setHideInstalled(event.target.checked)}
              >
                {t("skillsCenter.hideInstalled")}
              </Checkbox>
            </div>
          )}
          {categories.length > 0 && (
            <div
              className={styles.categories}
              aria-label={t("skillsCenter.categories")}
            >
              <button
                type="button"
                aria-pressed={!category}
                className={!category ? styles.activeCategory : ""}
                onClick={() => setCategory("")}
              >
                {t("skillsCenter.all")}
              </button>
              {categories.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={category === item.id ? styles.activeCategory : ""}
                  aria-pressed={category === item.id}
                  onClick={() => setCategory(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}
          {loadError && (
            <Alert
              type="error"
              message={loadError}
              action={
                <Button onClick={() => void refresh()}>
                  {t("common.retry")}
                </Button>
              }
            />
          )}
          {!mine && catalog !== "local" && marketError && (
            <Alert
              type="warning"
              message={marketError}
              description={t("skillsCenter.marketUnavailable")}
            />
          )}
          {loading || (!mine && catalog !== "local" && marketLoading) ? (
            <div className={styles.loading}>
              <Spin />
            </div>
          ) : (
            <>
              <div className={styles.grid}>
                {mine || catalog === "local"
                  ? visibleLocal.map((item) => (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={item.skill.name}
                        className={`${styles.card} ${
                          mine && !isEnabled(item) ? styles.disabled : ""
                        }`}
                        key={`${item.pkg.id}/${item.skill.slug}`}
                        onClick={() => void openLocal(item)}
                        onKeyDown={(event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            void openLocal(item);
                          }
                        }}
                      >
                        <SkillIcon skill={item.skill} />
                        <div className={styles.cardBody}>
                          <div className={styles.cardName}>
                            {item.skill.name}
                          </div>
                          <div
                            className={styles.cardDescription}
                            title={item.skill.description}
                          >
                            {item.skill.description ||
                              t("skills.noDescription")}
                          </div>
                        </div>
                        <div
                          className={styles.cardActions}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {mine ? (
                            <>
                              <Dropdown
                                menu={{
                                  items: [
                                    {
                                      key: "detail",
                                      label: t("common.viewDetail"),
                                      onClick: () => void openLocal(item),
                                    },
                                    ...(item.pkg.can_download === false ||
                                    item.pkg.allow_download === false
                                      ? []
                                      : [
                                          {
                                            key: "export",
                                            icon: <Download size={14} />,
                                            label: t("skills.exportSkill"),
                                            onClick: () =>
                                              void exportLocal(item),
                                          },
                                        ]),
                                    {
                                      key: "remove",
                                      icon: <Trash2 size={14} />,
                                      label: t("skillLibrary.uninstall"),
                                      danger: true,
                                      onClick: () => confirmRemove(item),
                                    },
                                  ],
                                }}
                                trigger={["click"]}
                              >
                                <button
                                  className={styles.more}
                                  type="button"
                                  aria-label={t("skillsCenter.more", {
                                    name: item.skill.name,
                                  })}
                                >
                                  <MoreHorizontal size={16} />
                                </button>
                              </Dropdown>
                              <Tooltip
                                title={t("skillsCenter.enable", {
                                  name: item.skill.name,
                                })}
                              >
                                <Switch
                                  size="small"
                                  aria-label={t("skillsCenter.enable", {
                                    name: item.skill.name,
                                  })}
                                  checked={isEnabled(item)}
                                  disabled={Boolean(busy)}
                                  loading={
                                    busy === `${item.pkg.id}/${item.skill.slug}`
                                  }
                                  onChange={(checked) =>
                                    void updateLibrary(item, true, checked)
                                  }
                                />
                              </Tooltip>
                            </>
                          ) : isInstalled(item) ? (
                            <Check
                              size={16}
                              aria-label={t("skillLibrary.installed")}
                            />
                          ) : (
                            <button
                              type="button"
                              className={styles.add}
                              aria-label={t("skillsCenter.install", {
                                name: item.skill.name,
                              })}
                              disabled={Boolean(busy)}
                              onClick={() => void updateLibrary(item, true)}
                            >
                              <Plus size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  : visibleMarket.map((skill) => (
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={skill.name}
                        className={styles.card}
                        key={skill.slug}
                        onClick={() => openMarket(skill)}
                        onKeyDown={(event) => {
                          if (
                            event.target === event.currentTarget &&
                            (event.key === "Enter" || event.key === " ")
                          ) {
                            event.preventDefault();
                            openMarket(skill);
                          }
                        }}
                      >
                        <SkillIcon
                          skill={{ icon_url: skill.iconUrl ?? undefined }}
                        />
                        <div className={styles.cardBody}>
                          <div className={styles.cardName}>{skill.name}</div>
                          <div
                            className={styles.cardDescription}
                            title={skill.description_zh || skill.description}
                          >
                            {i18n.language.startsWith("zh")
                              ? skill.description_zh || skill.description
                              : skill.description}
                          </div>
                        </div>
                        <div className={styles.cardActions}>
                          {installedMatch(skill) ? (
                            <Check
                              size={16}
                              aria-label={t("skillLibrary.installed")}
                            />
                          ) : (
                            <button
                              className={styles.add}
                              type="button"
                              disabled={Boolean(busy)}
                              aria-label={t("skillsCenter.install", {
                                name: skill.name,
                              })}
                              onClick={(event) => {
                                event.stopPropagation();
                                void installMarket(skill);
                              }}
                            >
                              {busy === `market:${skill.slug}` ? (
                                <Spin size="small" />
                              ) : (
                                <Plus size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
              </div>
              {(mine || catalog === "local"
                ? visibleLocal.length === 0
                : !marketError && visibleMarket.length === 0) && (
                <Empty
                  className={styles.empty}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={t(
                    mine
                      ? "skillsCenter.noInstalled"
                      : "skillsCenter.noResults",
                  )}
                />
              )}
            </>
          )}
        </div>
      </div>
      <Modal
        open={Boolean(selection)}
        onCancel={closeDetail}
        footer={null}
        width={640}
        centered
        className={styles.detailModal}
        title={null}
        destroyOnClose
      >
        {selection && selectedSkill && (
          <>
            <div className={styles.detailHeader}>
              <SkillIcon
                skill={{
                  icon_url:
                    selection.kind === "local"
                      ? selection.item.skill.icon_url
                      : selection.skill.iconUrl ?? undefined,
                  emoji:
                    selection.kind === "local"
                      ? selection.item.skill.emoji
                      : undefined,
                }}
              />
              <div className={styles.detailTitle}>
                <h2>{selectedSkill.name}</h2>
                <div className={styles.detailActions}>
                  {selectedLocal ? (
                    <>
                      <Switch
                        size="small"
                        aria-label={t("skillsCenter.enable", {
                          name: selectedSkill.name,
                        })}
                        checked={isEnabled(selectedLocal)}
                        disabled={Boolean(busy)}
                        onChange={(enabled) =>
                          void updateLibrary(selectedLocal, true, enabled)
                        }
                      />
                      <Button onClick={() => confirmRemove(selectedLocal)}>
                        {t("skillLibrary.uninstall")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="primary"
                      loading={Boolean(busy)}
                      onClick={() =>
                        selection.kind === "market"
                          ? void installMarket(selection.skill)
                          : void updateLibrary(selection.item, true)
                      }
                    >
                      {t("skillLibrary.install")}
                    </Button>
                  )}
                  {selection.kind === "local" &&
                    canWrite(selection.item.pkg) && (
                      <Button
                        icon={<Pencil size={14} />}
                        disabled={!detail}
                        onClick={editLocal}
                      >
                        {t("common.edit")}
                      </Button>
                    )}
                </div>
              </div>
            </div>
            <p className={styles.detailDescription}>
              {selectedDescription || t("skills.noDescription")}
            </p>
            {selection.kind === "local" && (
              <div className={styles.source}>
                {t("skillsCenter.source", { name: selection.item.pkg.name })}
              </div>
            )}
            <div className={styles.overviewHeader}>
              <h3>{t("skillsCenter.overview")}</h3>
              <Input
                prefix={<Search size={14} />}
                value={overviewQuery}
                allowClear
                aria-label={t("skillsCenter.searchOverview")}
                placeholder={t("skillsCenter.searchOverview")}
                onChange={(event) => setOverviewQuery(event.target.value)}
              />
              {overviewQuery && (
                <span aria-live="polite">{overviewMatches}</span>
              )}
            </div>
            <div className={styles.preview}>
              {detailLoading ? (
                <Spin />
              ) : overviewQuery ? (
                <p className={styles.searchText}>
                  {preview
                    .split(
                      new RegExp(
                        `(${overviewQuery.replace(
                          /[.*+?^${}()|[\]\\]/g,
                          "\\$&",
                        )})`,
                        "gi",
                      ),
                    )
                    .map((part, index) =>
                      part.toLocaleLowerCase() ===
                      overviewQuery.toLocaleLowerCase() ? (
                        <mark key={index}>{part}</mark>
                      ) : (
                        part
                      ),
                    )}
                </p>
              ) : (
                <Markdown content={preview} />
              )}
            </div>
          </>
        )}
      </Modal>
      <SkillImportModal
        open={importOpen}
        importing={importing}
        onClose={() => setImportOpen(false)}
        onImportUrl={importUrl}
        onImportZip={importZip}
      />
      <SkillDrawer
        open={editorOpen}
        editingSkill={
          detail
            ? {
                ...detail,
                enabled: true,
              }
            : null
        }
        form={skillForm}
        onClose={() => setEditorOpen(false)}
        onSubmit={saveLocal}
        readOnly={selection?.kind !== "local" || !canWrite(selection.item.pkg)}
      />
    </PageShell>
  );
}
