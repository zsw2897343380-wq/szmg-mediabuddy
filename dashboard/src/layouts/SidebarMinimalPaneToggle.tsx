import { ArrowLeftRight, LayoutGrid } from "lucide-react";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";
import type { MinimalNavPane } from "./layoutModeStorage";
import styles from "./Sidebar.module.less";

export default function SidebarMinimalPaneToggle({
  settingsLabel,
  minimalPane,
  collapsed,
  onSelect,
}: {
  /** Name of the first navigation group. */
  settingsLabel: string;
  minimalPane: MinimalNavPane;
  /** Icon-only control when the rail is collapsed (desktop). */
  collapsed: boolean;
  onSelect: (pane: MinimalNavPane, opts?: { expand?: boolean }) => void;
}) {
  const { t } = useTranslation();
  const nextPane: MinimalNavPane =
    minimalPane === "records" ? "settings" : "records";
  const nextLabel =
    nextPane === "settings" ? settingsLabel : t("nav.paneRecords");

  if (collapsed) {
    return (
      <div className={styles.minimalPaneToggleCollapsed}>
        <Tooltip title={nextLabel} placement="right">
          <button
            type="button"
            className={styles.minimalPaneIconBtn}
            onClick={() => onSelect(nextPane, { expand: true })}
            aria-label={nextLabel}
          >
            <ArrowLeftRight size={16} strokeWidth={1.8} />
          </button>
        </Tooltip>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className={styles.moreNavButton}
        onClick={() => onSelect(nextPane)}
        aria-label={nextLabel}
        aria-expanded={minimalPane === "settings"}
      >
        <LayoutGrid size={16} strokeWidth={1.8} />
        {minimalPane === "records" ? t("nav.more") : t("nav.paneRecords")}
      </button>
      {minimalPane === "settings" && (
        <div className={styles.minimalPaneHeader}>
          <span className={styles.navGroupLabel}>{settingsLabel}</span>
        </div>
      )}
    </div>
  );
}
