import { memo } from "react";
import { Typography } from "antd";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ConnectorCatalogEntry } from "../../../api/modules/connectors";
import { ConnectorLogo, connectorAccent } from "./connectorDefs";
import styles from "./index.module.less";

interface ConnectorCardProps {
  entry: ConnectorCatalogEntry;
  onConfigure: (entry: ConnectorCatalogEntry, instance: null) => void;
  onConnect?: (entry: ConnectorCatalogEntry, instance: null) => void;
}

export const ConnectorCard = memo(function ConnectorCard({
  entry,
  onConfigure,
  onConnect = onConfigure,
}: ConnectorCardProps) {
  const { t } = useTranslation();
  const accent = connectorAccent(entry);
  const disabled = entry.phase !== "available";

  return (
    <div
      className={`${styles.typeCard}${
        disabled ? ` ${styles.typeCardDisabled}` : ""
      }`}
      style={{ "--connector-accent": accent } as React.CSSProperties}
      onClick={() => !disabled && onConfigure(entry, null)}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ") &&
          !disabled
        ) {
          e.preventDefault();
          onConfigure(entry, null);
        }
      }}
    >
      <div className={styles.typeCardBody}>
        <div className={styles.typeCardHeader}>
          <div className={styles.typeCardIconLarge}>
            <ConnectorLogo kind={entry.kind} icon={entry.icon} size={40} />
          </div>
          <div className={styles.typeCardTitleCol}>
            <Typography.Text
              className={styles.typeCardTitle}
              ellipsis={{ tooltip: entry.name }}
            >
              {entry.name}
            </Typography.Text>
            <div className={styles.typeCardDesc}>{entry.description}</div>
          </div>
          <button
            type="button"
            className={styles.connectorAdd}
            disabled={disabled}
            aria-label={t("connectorCenter.connectNamed", { name: entry.name })}
            onClick={(event) => {
              event.stopPropagation();
              onConnect(entry, null);
            }}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});
