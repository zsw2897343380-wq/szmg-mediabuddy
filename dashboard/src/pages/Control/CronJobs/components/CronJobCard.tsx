import { Dropdown, Switch, Tooltip } from "antd";
import {
  Pencil,
  Play,
  Trash2,
  MoreHorizontal,
  Clock,
  AlertCircle,
  History,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../../../../hooks/useCurrentUser";
import { userCan } from "../../../../utils/permissions";
import type { CronJobSpecOutput } from "../../../../api/types";
import styles from "../index.module.less";
import { extractPromptFromJob, formatCronTimestamp } from "../cronDisplay";
import {
  formatTriggerText,
  oneShotPhase,
  oneShotPhaseLabelKey,
} from "../onceSchedule";

type CronJob = CronJobSpecOutput;
interface CronJobCardProps {
  job: CronJob;
  timeZone: string;
  onDetail: (job: CronJob) => void;
  onViewRecords: (jobId: string) => void;
  onToggleEnabled: (job: CronJob) => void;
  onExecuteNow: (job: CronJob) => void;
  onEdit: (job: CronJob) => void;
  onDelete: (jobId: string) => void;
}
export function CronJobCard({
  job,
  timeZone,
  onDetail,
  onViewRecords,
  onToggleEnabled,
  onExecuteNow,
  onEdit,
  onDelete,
}: CronJobCardProps) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const meta = job.meta ?? {};
  const status =
    typeof meta.octop_last_status === "string" ? meta.octop_last_status : "";
  const error =
    typeof meta.octop_last_error === "string" ? meta.octop_last_error : "";
  const lastRun =
    typeof meta.octop_last_run_at === "number" ? meta.octop_last_run_at : null;
  const phase = oneShotPhase(job.schedule.cron, Boolean(job.enabled), status);
  const trigger = formatTriggerText(job.schedule.cron, {
    mail: t("cronJobs.form.agentlyNewMail"),
    once: t("cronJobs.form.scheduleModeOnce"),
  });
  return (
    <article
      className={`${styles.cronCard} ${
        job.enabled ? "" : styles.cronCardPaused
      }`}
    >
      <div className={styles.cronCardHeader}>
        <button
          type="button"
          className={styles.cronCardName}
          onClick={() => onDetail(job)}
          title={job.name}
        >
          {job.name}
        </button>
        {status === "error" ? (
          <Tooltip title={error || t("cronJobs.workbuddy.failed")}>
            <AlertCircle size={16} className={styles.runFailure} />
          </Tooltip>
        ) : null}
        <div className={styles.cronCardActions}>
          <div className={styles.cronCardHoverActions}>
            <Tooltip title={t("cronJobs.executeNow")}>
              <button
                type="button"
                aria-label={t("cronJobs.executeNow")}
                className={styles.cardIconButton}
                onClick={() => onExecuteNow(job)}
                disabled={!userCan(user, "tasks.use")}
              >
                <Play size={15} />
              </button>
            </Tooltip>
            <Tooltip title={t("common.edit")}>
              <button
                type="button"
                aria-label={t("common.edit")}
                className={styles.cardIconButton}
                onClick={() => onEdit(job)}
                disabled={!userCan(user, "tasks.edit")}
              >
                <Pencil size={15} />
              </button>
            </Tooltip>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  {
                    key: "records",
                    label: t("cronJobs.workbuddy.records"),
                    icon: <History size={15} />,
                    onClick: () => onViewRecords(job.id),
                  },
                  {
                    key: "delete",
                    disabled: !userCan(user, "tasks.delete"),
                    label: t("common.delete"),
                    icon: <Trash2 size={15} />,
                    danger: true,
                    onClick: () => onDelete(job.id),
                  },
                ],
              }}
            >
              <button
                type="button"
                className={styles.cardIconButton}
                aria-label={t("common.more")}
              >
                <MoreHorizontal size={16} />
              </button>
            </Dropdown>
          </div>
          <Switch
            size="small"
            checked={job.enabled}
            aria-label={job.enabled ? t("common.disable") : t("common.enable")}
            onChange={() => onToggleEnabled(job)}
            disabled={!userCan(user, "tasks.edit")}
          />
        </div>
      </div>
      <p className={styles.cronCardDesc} title={extractPromptFromJob(job)}>
        {extractPromptFromJob(job) || "\u00a0"}
      </p>
      <div className={styles.cronCardFooter}>
        <span className={styles.cronCardSchedule} title={trigger}>
          <Clock size={14} />
          <span>{trigger}</span>
        </span>
        <Tooltip title={formatCronTimestamp(lastRun, timeZone)}>
          <span className={styles.cronCardState}>
            {phase
              ? t(oneShotPhaseLabelKey(phase))
              : job.enabled
              ? t("common.enabled")
              : t("common.disabled")}
          </span>
        </Tooltip>
      </div>
    </article>
  );
}
