import { Tag, Typography } from "antd";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  ConnectorCatalogEntry,
  ConnectorInstance,
} from "../../../api/modules/connectors";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { ConnectorLogo } from "./connectorDefs";
import styles from "./index.module.less";

interface ConnectorInstanceCardProps {
  instance: ConnectorInstance;
  catalogEntry: ConnectorCatalogEntry | undefined;
  onEdit: (instance: ConnectorInstance) => void;
  onChanged: () => void | Promise<void>;
  onTry?: (instance: ConnectorInstance) => void;
}

export function ConnectorInstanceCard({
  instance,
  catalogEntry,
  onEdit,
  onTry,
}: ConnectorInstanceCardProps) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const isOwner = user?.id === instance.owner_user_id;
  const ownerLabel =
    instance.owner_display_name || instance.owner_username || "";
  const ready = instance.status === "active" && instance.has_credentials;
  const status = !instance.has_credentials
    ? "unauthorized"
    : ready
    ? "active"
    : "disabled";
  return (
    <div
      className={styles.typeCard}
      role="button"
      tabIndex={0}
      onClick={() => onEdit(instance)}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          (event.key === "Enter" || event.key === " ")
        ) {
          event.preventDefault();
          onEdit(instance);
        }
      }}
    >
      <div className={styles.typeCardBody}>
        <div className={styles.typeCardHeader}>
          <div className={styles.typeCardIconLarge}>
            <ConnectorLogo
              kind={instance.kind}
              icon={catalogEntry?.icon}
              size={40}
            />
          </div>
          <div className={styles.typeCardTitleCol}>
            <div className={styles.instanceNameRow}>
              <Typography.Text
                className={styles.typeCardTitle}
                ellipsis={{ tooltip: instance.display_name }}
              >
                {instance.display_name}
              </Typography.Text>
              <span
                className={`${styles.statusDot} ${
                  ready ? styles.statusActive : styles.statusInactive
                }`}
                aria-label={t(`connectorCenter.status.${status}`)}
                title={t(`connectorCenter.status.${status}`)}
              />
            </div>
            {instance.shared && (
              <Tag className={styles.instanceCardTag}>
                {isOwner || !ownerLabel
                  ? t("connectors.sharedBadge", "共享")
                  : t("connectors.sharedFrom", {
                      name: ownerLabel,
                      defaultValue: `来自 ${ownerLabel}`,
                    })}
              </Tag>
            )}
            <div className={styles.typeCardDesc}>
              {instance.description ||
                catalogEntry?.description ||
                instance.kind}
            </div>
          </div>
          <button
            type="button"
            className={styles.connectorTry}
            aria-label={t(
              ready
                ? "connectorCenter.tryNamed"
                : "connectorCenter.configureNamed",
              { name: instance.display_name },
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (ready && onTry) onTry(instance);
              else onEdit(instance);
            }}
          >
            {ready ? <ArrowUpRight size={16} /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
