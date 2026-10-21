import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert, App, Button, Drawer, Dropdown, Empty, Spin, Tag } from "antd";
import {
  Bot,
  Brain,
  ChevronDown,
  MessageSquare,
  MoreHorizontal,
  Pin,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAgent, type OctopAgent } from "../../context/AgentContext";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useServerTimezone } from "../../hooks/useServerTimezone";
import { assistantsApi } from "../../api/modules/assistants";
import {
  octopThreadsApi,
  type OctopThread,
} from "../../api/modules/octopThreads";
import { apiErrorMessage } from "../../utils/apiError";
import { isDefaultChatAgent } from "../../utils/defaultChat";
import { formatServerDateTime } from "../../utils/formatMessageTime";
import { userCan } from "../../utils/permissions";
import ExpertAgentAvatar from "../Chat/components/ExpertAgentAvatar";
import { usePinnedExperts } from "../Chat/hooks/usePinnedExperts";
import { sortExpertsByPin } from "../Chat/utils/pinnedExpertsPrefs";
import AssistantForm from "./AssistantForm";
import styles from "./index.module.less";

const ChannelsPanel = lazy(() => import("../Agent/Channels/ChannelsPanel"));
const MemoryPanel = lazy(() => import("../Agent/Memory/MemoryPanel"));

export function personalAssistants(
  agents: OctopAgent[],
  userId: number | undefined,
): OctopAgent[] {
  return agents.filter(
    (agent) =>
      !agent.bridge &&
      agent.kind !== "team" &&
      (agent.is_owner === true || (userId != null && agent.user_id === userId)),
  );
}

function taskStatus(thread: OctopThread): "running" | "waiting" | "history" {
  return thread.awaiting_user
    ? "waiting"
    : thread.turn_active
    ? "running"
    : "history";
}

export default function AssistantsPage() {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const user = useCurrentUser();
  const {
    agents,
    loading,
    error: agentsError,
    refresh,
    setActiveAgent,
  } = useAgent();
  const { pinnedIds, togglePin, isPinned } = usePinnedExperts();
  const timeZone = useServerTimezone();
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState<"profile" | "tasks">("profile");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OctopAgent | null>(null);
  const [settingsTab, setSettingsTab] = useState<"channels" | "memory" | null>(
    null,
  );
  const [threads, setThreads] = useState<OctopThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [threadRevision, setThreadRevision] = useState(0);
  const personal = useMemo(
    () => sortExpertsByPin(personalAssistants(agents, user?.id), pinnedIds),
    [agents, user?.id, pinnedIds],
  );
  const local =
    personal.find(isDefaultChatAgent) ??
    personal.find((agent) => agent.agent_id === "main");
  const specialists = personal.filter(
    (agent) => agent !== local && !isDefaultChatAgent(agent),
  );
  const selected =
    personal.find((agent) => agent.agent_id === params.get("agent")) ??
    local ??
    personal[0];
  const selectedId = selected?.agent_id;
  const selectedState = selected?.state;
  const canManage =
    userCan(user, "assistants.edit") || userCan(user, "experts.edit");
  const canCreate =
    userCan(user, "assistants.create") || userCan(user, "experts.create");
  const canDelete =
    userCan(user, "assistants.delete") || userCan(user, "experts.delete");
  const canRun =
    userCan(user, "assistants.use") || userCan(user, "experts.use");
  const canChannels = userCan(user, "channels");
  const canMemory = userCan(user, "memory");

  useEffect(() => {
    setThreads([]);
    setThreadsError(null);
    if (!selectedId) return;
    let cancelled = false;
    const pull = (initial: boolean) => {
      if (initial) setThreadsLoading(true);
      void octopThreadsApi
        .list(selectedId, 500, "activity")
        .then((rows) => {
          if (!cancelled) {
            setThreads(
              rows.filter(
                (row) =>
                  row.has_messages || row.turn_active || row.awaiting_user,
              ),
            );
            setThreadsError(null);
          }
        })
        .catch((err) => {
          if (!cancelled)
            setThreadsError(
              apiErrorMessage(err, t("assistants.tasksFailed"), t),
            );
        })
        .finally(() => {
          if (!cancelled) setThreadsLoading(false);
        });
    };
    pull(true);
    const timer = window.setInterval(() => pull(false), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedId, threadRevision, t]);

  useEffect(() => {
    if (!selectedState || !["starting", "stopping"].includes(selectedState))
      return;
    const timer = window.setInterval(() => {
      void refresh({ silent: true });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [selectedState, refresh]);

  const select = (id: string) => {
    setParams({ agent: id });
    setTab("profile");
  };
  const create = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const edit = (agent: OctopAgent) => {
    setEditing(agent);
    setFormOpen(true);
  };
  const openChat = () => {
    if (!selected) return;
    setActiveAgent(selected.agent_id);
    navigate(`/chat/${encodeURIComponent(selected.agent_id)}`, {
      state: { newChat: true },
    });
  };
  const remove = (agent: OctopAgent) => {
    modal.confirm({
      title: t("assistants.deleteTitle", { name: agent.name }),
      content: t("assistants.deleteDescription"),
      okText: t("common.delete"),
      okButtonProps: { danger: true },
      cancelText: t("common.cancel"),
      onOk: async () => {
        try {
          await assistantsApi.remove(agent.agent_id);
          await refresh();
        } catch (err) {
          void message.error(
            apiErrorMessage(err, t("assistants.deleteFailed"), t),
          );
          throw err;
        }
      },
    });
  };
  const setRunning = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await assistantsApi.setRunning(
        selected.agent_id,
        selected.state !== "running",
      );
      await refresh();
    } catch (err) {
      void message.error(apiErrorMessage(err, t("assistants.stateFailed"), t));
    } finally {
      setBusy(false);
    }
  };
  const onSaved = useCallback(
    async (id: string) => {
      await refresh();
      setParams({ agent: id });
    },
    [refresh, setParams],
  );
  const deleteTask = (thread: OctopThread) => {
    if (!selectedId) return;
    modal.confirm({
      title: t("assistants.deleteTaskTitle"),
      content: thread.title || t("assistants.untitledTask"),
      okText: t("common.delete"),
      okButtonProps: { danger: true },
      cancelText: t("common.cancel"),
      onOk: async () => {
        try {
          await octopThreadsApi.delete(selectedId, thread.thread_id, false);
          setThreadRevision((value) => value + 1);
        } catch (err) {
          void message.error(
            apiErrorMessage(err, t("assistants.deleteFailed"), t),
          );
          throw err;
        }
      },
    });
  };
  const active = threads.filter(
    (thread) => taskStatus(thread) === "running",
  ).length;
  const waiting = threads.filter(
    (thread) => taskStatus(thread) === "waiting",
  ).length;
  const lastActive = threads.reduce(
    (last, thread) => Math.max(last, thread.last_active),
    0,
  );
  const actions = (agent: OctopAgent) => [
    {
      key: "profile",
      label: t("assistants.viewProfile"),
      onClick: () => select(agent.agent_id),
    },
    ...(canManage
      ? [
          {
            key: "edit",
            label: t("assistants.edit"),
            onClick: () => edit(agent),
          },
        ]
      : []),
    {
      key: "pin",
      label: t(
        isPinned(agent.agent_id) ? "assistants.unpin" : "assistants.pin",
      ),
      onClick: () => togglePin(agent.agent_id),
    },
    ...(canDelete && agent.agent_id !== "main" && !isDefaultChatAgent(agent)
      ? [
          {
            key: "delete",
            label: t("common.delete"),
            danger: true,
            onClick: () => remove(agent),
          },
        ]
      : []),
  ];

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar} aria-label={t("assistants.title")}>
        <div className={styles.sidebarTitle}>
          <h1>{t("assistants.title")}</h1>
          <span className={styles.beta}>BETA</span>
          <Button
            type="text"
            size="small"
            icon={<RefreshCw size={15} />}
            aria-label={t("common.refresh")}
            onClick={() => void refresh()}
          />
        </div>
        {local && (
          <button
            className={`${styles.localEntry} ${
              selectedId === local.agent_id ? styles.selected : ""
            }`}
            onClick={() => select(local.agent_id)}
          >
            <Bot size={22} />
            <span>
              {t("assistants.localAssistant")}
              <small>{t("assistants.localDescription")}</small>
            </span>
          </button>
        )}
        <div className={styles.sectionHeader}>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            <ChevronDown
              size={15}
              style={{ transform: expanded ? undefined : "rotate(-90deg)" }}
            />
            {t("assistants.myAssistants")} ({specialists.length})
          </button>
          {canCreate && (
            <Button
              type="text"
              size="small"
              icon={<Plus size={17} />}
              aria-label={t("assistants.create")}
              onClick={create}
            />
          )}
        </div>
        {loading ? (
          <Spin className={styles.loading} />
        ) : (
          expanded && (
            <div
              className={styles.list}
              role="tablist"
              aria-label={t("assistants.myAssistants")}
            >
              {specialists.map((agent) => (
                <div
                  key={agent.agent_id}
                  className={`${styles.listItem} ${
                    selectedId === agent.agent_id ? styles.selected : ""
                  }`}
                >
                  <button
                    role="tab"
                    aria-selected={selectedId === agent.agent_id}
                    onClick={() => select(agent.agent_id)}
                  >
                    <ExpertAgentAvatar
                      iconName={agent.icon_name}
                      iconUrl={agent.icon_url}
                      color={agent.color}
                    />
                    <span>
                      <strong>{agent.name}</strong>
                      <small>
                        {agent.description || t("assistants.generalAssistant")}
                      </small>
                    </span>
                  </button>
                  {isPinned(agent.agent_id) && (
                    <Pin size={13} className={styles.pin} />
                  )}
                  <Dropdown
                    trigger={["click"]}
                    menu={{ items: actions(agent) }}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<MoreHorizontal size={16} />}
                      aria-label={t("assistants.more", { name: agent.name })}
                    />
                  </Dropdown>
                </div>
              ))}
              {!specialists.length && (
                <p className={styles.sidebarEmpty}>
                  {t("assistants.noAssistants")}
                </p>
              )}
            </div>
          )
        )}
      </aside>
      <main className={styles.main}>
        {agentsError && (
          <Alert
            type="error"
            message={agentsError}
            showIcon
            action={
              <Button onClick={() => void refresh()}>
                {t("common.retry")}
              </Button>
            }
          />
        )}
        {!selected ? (
          <div className={styles.empty}>
            <Bot size={48} />
            <h2>{t("assistants.emptyTitle")}</h2>
            <p>{t("assistants.emptyDescription")}</p>
            {canCreate && (
              <Button type="primary" icon={<Plus size={16} />} onClick={create}>
                {t("assistants.create")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <header className={styles.header}>
              <div
                className={styles.tabs}
                role="tablist"
                aria-label={selected.name}
              >
                {(["profile", "tasks"] as const).map((key) => (
                  <button
                    role="tab"
                    aria-selected={tab === key}
                    className={tab === key ? styles.activeTab : ""}
                    key={key}
                    onClick={() => setTab(key)}
                  >
                    {t(`assistants.${key}`)}
                  </button>
                ))}
              </div>
              <div className={styles.headerActions}>
                <Button
                  type="text"
                  icon={<RefreshCw size={16} />}
                  onClick={() => setThreadRevision((value) => value + 1)}
                  aria-label={t("assistants.refreshTasks")}
                />
                {(canChannels || canMemory) && (
                  <Button
                    type="text"
                    icon={<Settings size={17} />}
                    onClick={() =>
                      setSettingsTab(canChannels ? "channels" : "memory")
                    }
                  >
                    {t("assistants.settings")}
                  </Button>
                )}
              </div>
            </header>
            <div className={styles.content}>
              {threadsError && (
                <Alert
                  type="warning"
                  message={threadsError}
                  showIcon
                  action={
                    <Button
                      onClick={() => setThreadRevision((value) => value + 1)}
                    >
                      {t("common.retry")}
                    </Button>
                  }
                />
              )}
              {tab === "profile" ? (
                <>
                  <section className={styles.hero}>
                    <ExpertAgentAvatar
                      iconName={selected.icon_name}
                      iconUrl={selected.icon_url}
                      color={selected.color}
                      size={116}
                    />
                    <div className={styles.heroIdentity}>
                      <div>
                        <h2>{selected.name}</h2>
                        <Tag
                          color={
                            selected.state === "running" ? "green" : "default"
                          }
                        >
                          {t(
                            `assistants.state.${
                              [
                                "running",
                                "starting",
                                "stopped",
                                "stopping",
                                "failed",
                              ].includes(selected.state)
                                ? selected.state
                                : "stopped"
                            }`,
                          )}
                        </Tag>
                      </div>
                      <p>
                        {selected.description ||
                          t("assistants.generalAssistant")}
                      </p>
                      <div className={styles.heroActions}>
                        <Button
                          type="primary"
                          icon={<MessageSquare size={16} />}
                          onClick={openChat}
                          disabled={
                            selected.state !== "running" ||
                            !userCan(user, "chat.use") ||
                            !canRun
                          }
                        >
                          {t("assistants.startChat")}
                        </Button>
                        {canManage && (
                          <Button onClick={() => edit(selected)}>
                            {t("assistants.edit")}
                          </Button>
                        )}
                        {canRun && (
                          <Button
                            loading={busy}
                            disabled={["starting", "stopping"].includes(
                              selected.state,
                            )}
                            onClick={() => void setRunning()}
                          >
                            {t(
                              selected.state === "running"
                                ? "assistants.stop"
                                : "assistants.start",
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </section>
                  {selected.last_error && (
                    <Alert
                      type="error"
                      showIcon
                      message={selected.last_error}
                    />
                  )}
                  <section className={styles.overview}>
                    <h3>{t("assistants.taskOverview")}</h3>
                    {threadsLoading ? (
                      <Spin />
                    ) : (
                      <div className={styles.metrics}>
                        {[
                          [
                            t("assistants.totalTasks"),
                            `${threads.length}${
                              threads.length === 500 ? "+" : ""
                            }`,
                          ],
                          [t("assistants.activeTasks"), active],
                          [t("assistants.waitingTasks"), waiting],
                          [
                            t("assistants.lastActive"),
                            formatServerDateTime(lastActive, timeZone),
                          ],
                        ].map(([label, value]) => (
                          <div key={label}>
                            <strong>{value}</strong>
                            <span>{label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <p className={styles.statsHint}>
                      {t("assistants.statsHint")}
                    </p>
                  </section>
                  <div className={styles.infoGrid}>
                    <section>
                      <h3>{t("assistants.statusTitle")}</h3>
                      <dl>
                        <dt>{t("assistants.execution")}</dt>
                        <dd>
                          {active
                            ? t("assistants.executing", { count: active })
                            : t("assistants.idle")}
                        </dd>
                        <dt>{t("assistants.scope")}</dt>
                        <dd>{t("assistants.personalScope")}</dd>
                        <dt>{t("assistants.imChannels")}</dt>
                        <dd>
                          {canChannels ? (
                            <button onClick={() => setSettingsTab("channels")}>
                              {t("assistants.configureChannels")}
                            </button>
                          ) : (
                            t("assistants.noPermission")
                          )}
                        </dd>
                        <dt>{t("assistants.memory")}</dt>
                        <dd>
                          {canMemory ? (
                            <button onClick={() => setSettingsTab("memory")}>
                              {t("assistants.manageMemory")}
                            </button>
                          ) : (
                            t("assistants.noPermission")
                          )}
                        </dd>
                      </dl>
                    </section>
                    <section>
                      <h3>{t("assistants.taskConfiguration")}</h3>
                      <dl>
                        <dt>{t("assistants.model")}</dt>
                        <dd>
                          {selected.default_model || t("assistants.autoModel")}
                        </dd>
                        <dt>{t("assistants.hiredExpert")}</dt>
                        <dd>
                          {selected.template_name || t("assistants.customRole")}
                        </dd>
                        <dt>{t("assistants.referenceMaterials")}</dt>
                        <dd>
                          {t("assistants.materialCount", {
                            count: selected.knowledge_base_ids?.length ?? 0,
                          })}
                        </dd>
                      </dl>
                      <p className={styles.description}>
                        {selected.system_prompt ||
                          t("assistants.noDescription")}
                      </p>
                    </section>
                  </div>
                </>
              ) : (
                <section className={styles.taskSection}>
                  <div className={styles.taskHeading}>
                    <h2>
                      {t("assistants.taskHistory", { name: selected.name })}
                    </h2>
                    <Button
                      type="primary"
                      icon={<Plus size={16} />}
                      disabled={
                        selected.state !== "running" ||
                        !userCan(user, "chat.use") ||
                        !canRun
                      }
                      onClick={openChat}
                    >
                      {t("assistants.newTask")}
                    </Button>
                  </div>
                  {threadsLoading ? (
                    <Spin />
                  ) : !threads.length ? (
                    <Empty description={t("assistants.noTasks")} />
                  ) : (
                    <div className={styles.taskTable}>
                      <table>
                        <thead>
                          <tr>
                            {[
                              "taskName",
                              "source",
                              "taskStatus",
                              "createdAt",
                              "actions",
                            ].map((key) => (
                              <th key={key}>{t(`assistants.${key}`)}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {threads.map((thread) => (
                            <tr key={thread.thread_id}>
                              <td>
                                <button
                                  className={styles.taskLink}
                                  onClick={() => {
                                    setActiveAgent(selected.agent_id);
                                    navigate(
                                      `/chat/${encodeURIComponent(
                                        selected.agent_id,
                                      )}/${encodeURIComponent(
                                        thread.thread_id,
                                      )}`,
                                    );
                                  }}
                                >
                                  {thread.title || t("assistants.untitledTask")}
                                </button>
                                <small>{thread.thread_id}</small>
                              </td>
                              <td>{thread.channel_type}</td>
                              <td>
                                <Tag
                                  color={
                                    taskStatus(thread) === "running"
                                      ? "processing"
                                      : taskStatus(thread) === "waiting"
                                      ? "warning"
                                      : "default"
                                  }
                                >
                                  {t(
                                    `assistants.taskStates.${taskStatus(
                                      thread,
                                    )}`,
                                  )}
                                </Tag>
                              </td>
                              <td>
                                {formatServerDateTime(
                                  thread.created_at,
                                  timeZone,
                                )}
                              </td>
                              <td>
                                <Button
                                  type="text"
                                  danger
                                  icon={<Trash2 size={16} />}
                                  aria-label={t("assistants.deleteTask")}
                                  disabled={Boolean(
                                    thread.turn_active ||
                                      thread.awaiting_user ||
                                      !userCan(user, "records.delete"),
                                  )}
                                  onClick={() => deleteTask(thread)}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </main>
      <AssistantForm
        open={formOpen}
        agent={editing}
        onClose={() => setFormOpen(false)}
        onSaved={onSaved}
      />
      <Drawer
        open={Boolean(settingsTab && selected)}
        width={1000}
        title={t("assistants.settings")}
        onClose={() => setSettingsTab(null)}
        destroyOnClose
        className={styles.settingsDrawer}
      >
        <div className={styles.settingsTabs}>
          {canChannels && (
            <Button
              type={settingsTab === "channels" ? "primary" : "text"}
              icon={<MessageSquare size={16} />}
              onClick={() => setSettingsTab("channels")}
            >
              {t("assistants.imChannels")}
            </Button>
          )}
          {canMemory && (
            <Button
              type={settingsTab === "memory" ? "primary" : "text"}
              icon={<Brain size={16} />}
              onClick={() => setSettingsTab("memory")}
            >
              {t("assistants.memory")}
            </Button>
          )}
        </div>
        <Suspense fallback={<Spin />}>
          {selected && settingsTab === "channels" && canChannels && (
            <ChannelsPanel agentId={selected.agent_id} />
          )}
          {selected && settingsTab === "memory" && canMemory && (
            <MemoryPanel
              key={selected.agent_id}
              agentId={selected.agent_id}
              fill={false}
            />
          )}
        </Suspense>
      </Drawer>
    </div>
  );
}
