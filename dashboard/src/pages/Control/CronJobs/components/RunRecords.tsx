import { useEffect, useRef, useState } from "react";
import { Alert, Button, Empty, Select, Spin, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { octopCronApi } from "../../../../api/modules/cronjob";
import type {
  CronJobSpecOutput,
  OctopCronRunRecord,
} from "../../../../api/types";
import { formatCronTimestamp } from "../cronDisplay";
import styles from "../index.module.less";

interface RunRecordsProps {
  agentId: string;
  jobs: CronJobSpecOutput[];
  timeZone: string;
  keyword: string;
  taskId?: string;
  onTaskChange: (id: string | undefined) => void;
  revision: number;
}
export function RunRecords({
  agentId,
  jobs,
  timeZone,
  keyword,
  taskId,
  onTaskChange,
  revision,
}: RunRecordsProps) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<OctopCronRunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("all");
  const generation = useRef(0);
  const loadingRef = useRef(false);
  useEffect(() => {
    const token = ++generation.current;
    setRecords([]);
    setHasMore(false);
    setLoading(true);
    setError(false);
    loadingRef.current = true;
    octopCronApi
      .records(agentId, 0, taskId)
      .then((page) => {
        if (generation.current !== token) return;
        setRecords(page.items);
        setHasMore(page.has_more);
      })
      .catch(() => {
        if (generation.current === token) setError(true);
      })
      .finally(() => {
        if (generation.current === token) {
          setLoading(false);
          loadingRef.current = false;
        }
      });
    return () => {
      generation.current += 1;
    };
  }, [agentId, taskId, revision]);
  const loadMore = async () => {
    if (loadingRef.current) return;
    const token = generation.current;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const page = await octopCronApi.records(agentId, records.length, taskId);
      if (generation.current !== token) return;
      setRecords((current) => [...current, ...page.items]);
      setHasMore(page.has_more);
    } catch {
      if (generation.current === token) setError(true);
    } finally {
      if (generation.current === token) {
        setLoading(false);
        loadingRef.current = false;
      }
    }
  };
  const query = keyword.trim().toLocaleLowerCase();
  const visible = records.filter(
    (record) =>
      (status === "all" || record.status === status) &&
      (!query ||
        `${record.name} ${record.error ?? ""}`
          .toLocaleLowerCase()
          .includes(query)),
  );
  return (
    <section className={styles.records}>
      <div className={styles.recordsFilters}>
        <span className={styles.recordsScope}>
          {t("cronJobs.workbuddy.recordScope")}
        </span>
        <Select
          aria-label={t("cronJobs.col.lastStatus")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: t("cronJobs.workbuddy.all") },
            { value: "ok", label: t("cronJobs.workbuddy.success") },
            { value: "error", label: t("cronJobs.workbuddy.failed") },
          ]}
        />
        <Select
          aria-label={t("cronJobs.col.name")}
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={t("cronJobs.workbuddy.allTasks")}
          value={taskId}
          onChange={onTaskChange}
          options={jobs.map((job) => ({ value: job.id, label: job.name }))}
        />
      </div>
      {error ? (
        <Alert
          showIcon
          type="error"
          message={t("cronJobs.workbuddy.recordsFailed")}
        />
      ) : null}
      <div className={styles.recordsTable}>
        <div className={styles.recordsHead}>
          <span>{t("cronJobs.col.name")}</span>
          <span>{t("cronJobs.col.lastStatus")}</span>
          <span>{t("cronJobs.workbuddy.executionTime")}</span>
          <span>{t("cronJobs.col.lastError")}</span>
        </div>
        {visible.map((record) => (
          <div className={styles.recordsRow} key={record.id}>
            <span title={record.name}>{record.name}</span>
            <span>
              <Tag color={record.status === "ok" ? "success" : "error"}>
                {t(
                  `cronJobs.workbuddy.${
                    record.status === "ok" ? "success" : "failed"
                  }`,
                )}
              </Tag>
            </span>
            <span>{formatCronTimestamp(record.executed_at, timeZone)}</span>
            <span title={record.error ?? ""}>{record.error || "—"}</span>
          </div>
        ))}
        {!loading && !error && visible.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("cronJobs.workbuddy.noRecords")}
          />
        ) : null}
      </div>
      {loading ? (
        <div className={styles.firstLoad}>
          <Spin />
        </div>
      ) : hasMore || error ? (
        <Button onClick={() => void loadMore()}>
          {t("cronJobs.workbuddy.loadMore")}
        </Button>
      ) : null}
    </section>
  );
}
