import { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Dropdown,
  Empty,
  Input,
  Modal,
  Spin,
  Switch,
} from "antd";
import {
  ArrowUpLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  connectorsApi,
  type ConnectorCatalogEntry,
  type ConnectorInstance,
  type ConnectorProbeResult,
} from "../../../api/modules/connectors";
import { useAgent } from "../../../context/AgentContext";
import { apiErrorMessage } from "../../../utils/apiError";
import { isAgentChatReady } from "../../../utils/agentError";
import { CapabilityHeaderActions } from "../../CapabilityCenter/HeaderActions";
import { setPendingAttachConnector } from "../../Chat/utils/pendingAttachConnector";
import { ConnectorCard } from "./ConnectorCard";
import { ConnectorInstanceCard } from "./ConnectorInstanceCard";
import { ConnectorLogo } from "./connectorDefs";
import { CustomMcpTab } from "./CustomMcpTab";
import styles from "./index.module.less";

interface ConnectorCenterProps {
  catalog: ConnectorCatalogEntry[];
  instances: ConnectorInstance[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onConfigure: (
    entry: ConnectorCatalogEntry,
    instance: ConnectorInstance | null,
  ) => void;
}

export function ConnectorCenter({
  catalog,
  instances,
  loading,
  onRefresh,
  onConfigure,
}: ConnectorCenterProps) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const { agents, activeAgentId } = useAgent();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<{
    kind: string;
    instanceId?: string;
  } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probe, setProbe] = useState<ConnectorProbeResult | null>(null);
  const probeGeneration = useRef(0);
  const selected = instances.find(
    (instance) => instance.instance_id === detail?.instanceId,
  );
  const entry = catalog.find((item) => item.kind === detail?.kind);
  const keyword = query.trim().toLocaleLowerCase();
  const visibleInstances = instances.filter((item) =>
    `${item.display_name} ${item.description ?? ""} ${item.kind}`
      .toLocaleLowerCase()
      .includes(keyword),
  );
  const installedKinds = new Set(instances.map((item) => item.kind));
  const visibleCatalog = catalog.filter(
    (item) =>
      !installedKinds.has(item.kind) &&
      `${item.name} ${item.description} ${item.kind}`
        .toLocaleLowerCase()
        .includes(keyword),
  );

  useEffect(() => {
    probeGeneration.current += 1;
    setToolsOpen(false);
    setProbe(null);
    setProbing(false);
  }, [detail?.kind, detail?.instanceId]);

  const showCustom = (name: string | null = null) => {
    setDetail(null);
    setCustomName(name);
    setCustomOpen(true);
  };
  const configure = () => {
    if (selected?.kind === "custom-mcp") showCustom(selected.mcp_server_name);
    else if (entry) {
      setDetail(null);
      onConfigure(entry, selected ?? null);
    }
  };
  const tryConnector = (instance: ConnectorInstance) => {
    const ready = agents.filter(
      (agent) =>
        !agent.bridge &&
        agent.is_owner !== false &&
        agent.kind !== "team" &&
        isAgentChatReady(agent.state, agent),
    );
    const agent =
      ready.find((item) => item.agent_id === activeAgentId) ?? ready[0];
    if (!agent) {
      message.info(t("connectorCenter.noAssistant"));
      return;
    }
    setPendingAttachConnector(agent.agent_id, instance.mcp_server_name);
    setDetail(null);
    navigate(`/chat/${agent.agent_id}`, {
      state: {
        newChat: true,
        prefillInput: t("connectorCenter.tryPrompt", {
          name: instance.display_name,
        }),
      },
    });
  };
  const toggle = async (enabled: boolean) => {
    if (!selected?.can_manage) return;
    setBusy(true);
    try {
      await connectorsApi.patchInstance(selected.instance_id, {
        status: enabled ? "active" : "disabled",
      });
      await onRefresh();
    } catch (error) {
      message.error(apiErrorMessage(error, t("connectors.toggleFailed"), t));
    } finally {
      setBusy(false);
    }
  };
  const disconnect = () => {
    if (!selected?.can_manage) return;
    const instance = selected;
    modal.confirm({
      title: t("connectors.deleteConfirm", { name: instance.display_name }),
      okText: t("connectorCenter.disconnect"),
      cancelText: t("common.cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        await connectorsApi.deleteInstance(instance.instance_id);
        setDetail(null);
        await onRefresh();
      },
    });
  };
  const loadTools = async (retry = false) => {
    if (!selected) return;
    if (toolsOpen && !retry) {
      setToolsOpen(false);
      return;
    }
    setToolsOpen(true);
    if (probe && !retry) return;
    const generation = probeGeneration.current;
    setProbing(true);
    try {
      const result = await connectorsApi.testInstance(selected.instance_id);
      if (generation === probeGeneration.current) setProbe(result);
    } catch (error) {
      if (generation === probeGeneration.current)
        setProbe({
          ok: false,
          error: apiErrorMessage(error, t("connectors.probeFailed"), t),
        });
    } finally {
      if (generation === probeGeneration.current) setProbing(false);
    }
  };
  const status = selected
    ? !selected.has_credentials
      ? "unauthorized"
      : selected.status === "active"
      ? "active"
      : "disabled"
    : "available";

  return (
    <section className={styles.connectorCenter}>
      <CapabilityHeaderActions resource="connectors">
        <Input
          className={styles.centerSearch}
          prefix={<Search size={15} />}
          allowClear
          value={query}
          placeholder={t("connectorCenter.search")}
          aria-label={t("connectorCenter.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button icon={<Plus size={16} />} onClick={() => showCustom()}>
          {t("connectorCenter.custom")}
        </Button>
        <Button
          type="text"
          aria-label={t("common.refresh")}
          icon={<RefreshCw size={15} />}
          loading={loading}
          onClick={() => void onRefresh()}
        />
      </CapabilityHeaderActions>
      <div className={styles.centerGridScroll}>
        {loading ? (
          <div className={styles.loadingState}>
            <Spin />
          </div>
        ) : visibleCatalog.length + visibleInstances.length === 0 ? (
          <Empty description={t("connectorCenter.empty")} />
        ) : (
          <div className={styles.typeGrid}>
            {visibleInstances.map((instance) => (
              <ConnectorInstanceCard
                key={instance.instance_id}
                instance={instance}
                catalogEntry={catalog.find(
                  (item) => item.kind === instance.kind,
                )}
                onEdit={(item) =>
                  setDetail({ kind: item.kind, instanceId: item.instance_id })
                }
                onTry={tryConnector}
                onChanged={onRefresh}
              />
            ))}
            {visibleCatalog.map((item) => (
              <ConnectorCard
                key={item.kind}
                entry={item}
                onConfigure={() => setDetail({ kind: item.kind })}
                onConnect={onConfigure}
              />
            ))}
          </div>
        )}
      </div>
      <Modal
        open={detail !== null}
        onCancel={() => setDetail(null)}
        footer={null}
        centered
        width={selected ? 630 : 380}
        className={`${styles.connectorDetail} ${
          selected ? styles.connectorDetailInstalled : ""
        }`}
        title={null}
        destroyOnHidden
      >
        <div className={styles.detailIcon}>
          <ConnectorLogo
            kind={detail?.kind ?? ""}
            icon={entry?.icon}
            size={52}
          />
        </div>
        <h2>{selected?.display_name ?? entry?.name}</h2>
        <p className={styles.detailDescription}>
          {selected?.description || entry?.description}
        </p>
        {selected && (
          <p className={styles.detailStatus}>
            <span
              className={`${styles.statusDot} ${
                status === "active"
                  ? styles.statusActive
                  : styles.statusInactive
              }`}
            />
            {t(`connectorCenter.status.${status}`)}
          </p>
        )}
        <div className={styles.detailActions}>
          {selected ? (
            <>
              <Button
                type="primary"
                icon={<ArrowUpRight size={16} />}
                disabled={status !== "active"}
                onClick={() => tryConnector(selected)}
              >
                {t("connectorCenter.try")}
              </Button>
              {selected.can_manage && (
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: "configure",
                        label: t("connectorCenter.configure"),
                        icon: <Settings2 size={14} />,
                        onClick: configure,
                      },
                      {
                        key: "add",
                        label: t("connectorCenter.addAccount"),
                        disabled: !entry || entry.phase !== "available",
                        onClick: () => {
                          if (entry) {
                            setDetail(null);
                            onConfigure(entry, null);
                          }
                        },
                      },
                      { type: "divider" },
                      {
                        key: "disconnect",
                        label: t("connectorCenter.disconnect"),
                        danger: true,
                        onClick: disconnect,
                      },
                    ],
                  }}
                  trigger={["click"]}
                >
                  <Button icon={<MoreHorizontal size={16} />}>
                    {t("connectorCenter.manage")}
                  </Button>
                </Dropdown>
              )}
            </>
          ) : (
            <Button
              type="primary"
              disabled={entry?.phase !== "available"}
              icon={<Plus size={16} />}
              onClick={configure}
            >
              {t(
                entry?.phase === "coming_soon"
                  ? "connectorCenter.comingSoon"
                  : "connectorCenter.connect",
              )}
            </Button>
          )}
        </div>
        {selected?.can_manage && (
          <div className={styles.detailEnabled}>
            <span>{t("connectorCenter.enable")}</span>
            <Switch
              aria-label={t("connectorCenter.enable")}
              checked={selected.status === "active"}
              loading={busy}
              onChange={(enabled) => void toggle(enabled)}
            />
          </div>
        )}
        {selected && (
          <div className={styles.detailTools}>
            <Button
              type="text"
              icon={
                toolsOpen ? (
                  <ChevronDown size={15} />
                ) : (
                  <ChevronRight size={15} />
                )
              }
              onClick={() => void loadTools()}
            >
              {t("connectorCenter.tools")}
            </Button>
            {toolsOpen &&
              (probing ? (
                <Spin size="small" />
              ) : probe?.ok ? (
                <div className={styles.toolsList}>
                  {probe.tools?.length ? (
                    probe.tools.map((tool) => (
                      <div key={tool.name}>
                        <strong>{tool.name}</strong>
                        <p>{tool.description}</p>
                      </div>
                    ))
                  ) : (
                    <p>{t("connectorCenter.noTools")}</p>
                  )}
                </div>
              ) : (
                <Alert
                  type="error"
                  showIcon
                  message={probe?.error || t("connectors.probeFailed")}
                  action={
                    <Button size="small" onClick={() => void loadTools(true)}>
                      {t("common.retry")}
                    </Button>
                  }
                />
              ))}
          </div>
        )}
        {entry?.doc_url && (
          <a
            className={styles.detailDocs}
            href={entry.doc_url}
            target="_blank"
            rel="noreferrer"
          >
            {t("connectorCenter.documentation")}
            <ExternalLink size={13} />
          </a>
        )}
      </Modal>
      <Modal
        open={customOpen}
        onCancel={() => {
          setCustomOpen(false);
          void onRefresh();
        }}
        footer={null}
        centered
        width={800}
        className={styles.customConnectorModal}
        title={
          <span className={styles.customTitle}>
            <ArrowUpLeft size={18} />
            {t("connectorCenter.custom")}
          </span>
        }
      >
        <CustomMcpTab focusServerName={customName} />
      </Modal>
    </section>
  );
}
