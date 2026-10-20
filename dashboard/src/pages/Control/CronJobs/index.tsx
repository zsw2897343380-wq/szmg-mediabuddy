import { useState, useEffect } from "react";
import {
  Button,
  Card,
  Empty,
  Form,
  Segmented,
  Input,
  Spin,
  Tooltip,
  Alert,
} from "antd";
import { LayoutGrid, List, RefreshCw, Search, Plus } from "lucide-react";
import type { CronJobSpecOutput } from "../../../api/types";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { setPendingPrefillText } from "../../Chat/hooks/chatStore";
import {
  createColumns,
  CronJobCard,
  ExecuteNowModal,
  JobDrawer,
  JobDetailDrawer,
  useCronJobs,
} from "./components";
import type { CronJobFormValues } from "./useCronJobs";
import { useCardTableView } from "../../../hooks/useCardTableView";
import { showConfirmModal } from "../../../utils/confirmModal";
import { OctopEmptyMascot } from "../../../components/EmptyState";
import { ResizableTable } from "../../../components/ResizableTable";
import PageShell from "../../../layouts/PageShell";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { userCan } from "../../../utils/permissions";
import { useAgent } from "../../../context/AgentContext";
import { taskExampleColumns } from "./taskExamples";
import { useTaskExamples } from "./useTaskExamples";
import styles from "./index.module.less";
import { RunRecords } from "./components/RunRecords";
import { filterCronJobs, type CronStatusFilter } from "./taskFilters";

type CronJob = CronJobSpecOutput;

interface CronJobsEmptyStateProps {
  onCreate: () => void;
  onSuggestionClick: (text: string) => void;
  suggestions: string[];
}

function CronJobsEmptyState({
  onCreate,
  onSuggestionClick,
  suggestions,
}: CronJobsEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyStateIcon}>
        <OctopEmptyMascot />
      </div>
      <h2 className={styles.emptyStateTitle}>{t("cronJobs.noJobs")}</h2>
      <p className={styles.emptyStateDesc}>{t("cronJobs.noJobsDesc")}</p>
      {suggestions.length > 0 ? (
        <div
          className={`${styles.emptyStateSuggestions} ${
            taskExampleColumns(suggestions.length) === 2
              ? styles.emptyStateSuggestionsCols2
              : ""
          }`}
        >
          {suggestions.map((text, i) => (
            <button
              key={i}
              type="button"
              className={styles.emptyStateSuggestionItem}
              title={text}
              onClick={() => onSuggestionClick(text)}
            >
              <span className={styles.emptyStateSuggestionText}>{text}</span>
              <span className={styles.emptyStateSuggestionArrow}>→</span>
            </button>
          ))}
        </div>
      ) : null}
      <Button
        type="primary"
        onClick={onCreate}
        className={styles.emptyStateCreateBtn}
      >
        + {t("cronJobs.createJob")}
      </Button>
    </div>
  );
}

function CronJobsPage() {
  const user = useCurrentUser();
  const { t } = useTranslation();
  const { isMobile, viewMode, setViewMode, showCardView } =
    useCardTableView("card");
  const navigate = useNavigate();
  const { activeAgentId, activeAgent } = useAgent();
  const canManageJobs = activeAgent?.is_owner === true;
  const taskExamples = useTaskExamples(activeAgentId);
  const {
    jobs,
    loading,
    listRefreshing,
    listStale,
    cronTimezone,
    createJob,
    updateJob,
    deleteJob,
    toggleEnabled,
    executeNow,
    jobToFormValues,
    refetchJobs,
  } = useCronJobs();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJobFormValues | null>(null);
  const [form] = Form.useForm<CronJobFormValues>();
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"tasks" | "records">("tasks");
  const [statusFilter, setStatusFilter] = useState<CronStatusFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [recordJobId, setRecordJobId] = useState<string>();
  const [recordsRevision, setRecordsRevision] = useState(0);

  // Detail drawer state
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<CronJob | null>(null);

  // Execute-now confirmation
  const [executingJob, setExecutingJob] = useState<CronJob | null>(null);
  const [executing, setExecuting] = useState(false);

  // Close transient UI when switching experts — avoid dangling drawers
  // tied to the previous agent's jobs.
  useEffect(() => {
    setDrawerOpen(false);
    setEditingJob(null);
    setDetailDrawerOpen(false);
    setDetailJob(null);
    setExecutingJob(null);
    setKeyword("");
    setStatusFilter("all");
    setRecordJobId(undefined);
  }, [activeAgentId]);

  const handleDetail = (job: CronJob) => {
    setDetailJob(job);
    setDetailDrawerOpen(true);
  };

  const handleDetailClose = () => {
    setDetailDrawerOpen(false);
    setDetailJob(null);
  };

  // Keep detail drawer in sync after list refresh (e.g. run-now).
  useEffect(() => {
    if (!detailDrawerOpen || !detailJob) return;
    const fresh = jobs.find((j) => j.id === detailJob.id);
    if (fresh) setDetailJob(fresh);
  }, [jobs, detailDrawerOpen, detailJob]);

  const handleCreate = () => {
    setEditingJob(null);
    form.resetFields();
    setDrawerOpen(true);
  };

  const handleSuggestionClick = (text: string) => {
    setPendingPrefillText(text);
    navigate("/chat", { state: { prefillInput: text } });
  };

  const handleEdit = (job: CronJob) => {
    setEditingJob(jobToFormValues(job, cronTimezone));
    setDrawerOpen(true);
  };

  const handleDelete = (jobId: string) => {
    showConfirmModal(
      {
        title: t("cronJobs.confirmDelete"),
        content: t("cronJobs.deleteConfirm"),
        okText: t("common.delete"),
        okType: "primary",
        cancelText: t("common.cancel"),
        onOk: async () => {
          await deleteJob(jobId);
        },
      },
      { isMobile },
    );
  };

  const handleToggleEnabled = async (job: CronJob) => {
    await toggleEnabled(job);
  };

  const handleExecuteNow = async (job: CronJob) => {
    setExecutingJob(job);
  };

  const handleExecuteNowConfirm = async () => {
    if (!executingJob) return;
    setExecuting(true);
    try {
      await executeNow(executingJob.id);
      setExecutingJob(null);
    } finally {
      setExecuting(false);
    }
  };

  const handleExecuteNowCancel = () => {
    if (executing) return;
    setExecutingJob(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refetchJobs(true);
      setRecordsRevision((value) => value + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setEditingJob(null);
  };

  const handleSubmit = async (values: CronJobFormValues) => {
    let success = false;
    if (editingJob?.id) {
      success = await updateJob(editingJob.id, values);
    } else {
      success = await createJob(values);
    }
    if (success) {
      setDrawerOpen(false);
      setEditingJob(null);
    }
  };

  const columns = createColumns({
    canEdit: userCan(user, "tasks.edit"),
    canRun: userCan(user, "tasks.use"),
    canDelete: userCan(user, "tasks.delete"),
    onDetail: handleDetail,
    onToggleEnabled: handleToggleEnabled,
    onExecuteNow: handleExecuteNow,
    onEdit: handleEdit,
    onDelete: handleDelete,
    t,
    timeZone: cronTimezone,
    stickyColumns: !isMobile,
  });

  // Shared experts are not a task scope. Non-owners should see the same
  // "pick an agent" empty as if nothing were selected — no shared-expert copy.
  if (!activeAgentId || !canManageJobs) {
    return (
      <PageShell
        title={t("pageShell.tasks.title")}
        subtitle={t("pageShell.tasks.subtitle")}
        agentScoped
      >
        <Card>
          <Empty description={t("cronJobs.noAgentSelected")} />
        </Card>
      </PageShell>
    );
  }

  // Keep list shell stable across expert switches, but do NOT show the
  // table/card toolbar when there's nothing to manage (empty already has CTAs).
  const contentBusy = listRefreshing || refreshing || listStale;
  const filteredJobs = filterCronJobs(jobs, statusFilter, keyword);
  const showList = jobs.length > 0;
  const showEmpty = !loading && !listStale && jobs.length === 0;
  const showBodySpinner = loading || (contentBusy && !showList && !showEmpty);
  const viewRecords = (jobId: string) => {
    setRecordJobId(jobId);
    setActiveTab("records");
  };

  return (
    <PageShell title={t("pageShell.tasks.title")} agentScoped embedded>
      <div className={styles.workspace}>
        <div className={styles.workspaceToolbar}>
          <div
            className={styles.workspaceTabs}
            role="tablist"
            aria-label={t("pageShell.tasks.title")}
          >
            {(["tasks", "records"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                className={
                  activeTab === tab
                    ? styles.workspaceTabActive
                    : styles.workspaceTab
                }
                onClick={() => setActiveTab(tab)}
              >
                {t(`cronJobs.workbuddy.${tab}`)}
              </button>
            ))}
          </div>
          <div className={styles.gridToolbarRight}>
            <Input
              className={styles.searchInput}
              prefix={<Search size={15} />}
              allowClear
              placeholder={t("cronJobs.workbuddy.searchPlaceholder")}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            {activeTab === "tasks" && showList ? (
              <Segmented
                size="small"
                value={viewMode}
                onChange={(value) => setViewMode(value as "table" | "card")}
                options={[
                  { value: "card", label: <LayoutGrid size={15} /> },
                  { value: "table", label: <List size={15} /> },
                ]}
              />
            ) : null}
            <Tooltip title={t("common.refresh")}>
              <Button
                icon={<RefreshCw size={15} />}
                loading={refreshing || listRefreshing || listStale}
                onClick={() => void handleRefresh()}
              />
            </Tooltip>
            <Button
              type="primary"
              icon={<Plus size={15} />}
              onClick={handleCreate}
              disabled={listStale || !userCan(user, "tasks.create")}
            >
              {t("cronJobs.createJob")}
            </Button>
          </div>
        </div>
        {activeAgent?.bridge ? (
          <Alert
            type="info"
            showIcon
            message={t("chat.remoteExpert.editBanner")}
            description={t("chat.remoteExpert.editTasks")}
            style={{ marginBottom: 12 }}
          />
        ) : null}
        {activeTab === "tasks" && showList ? (
          <div
            className={styles.statusFilters}
            role="tablist"
            aria-label={t("cronJobs.col.lastStatus")}
          >
            {(["all", "enabled", "paused"] as const).map((value) => (
              <button
                type="button"
                key={value}
                role="tab"
                aria-selected={statusFilter === value}
                className={
                  statusFilter === value
                    ? styles.statusFilterActive
                    : styles.statusFilter
                }
                onClick={() => setStatusFilter(value)}
              >
                {t(`cronJobs.workbuddy.${value}`)} (
                {value === "all"
                  ? jobs.length
                  : jobs.filter((job) =>
                      value === "enabled" ? job.enabled : !job.enabled,
                    ).length}
                )
              </button>
            ))}
          </div>
        ) : null}
        {activeTab === "records" ? (
          <RunRecords
            key={activeAgentId}
            agentId={activeAgentId}
            jobs={jobs}
            timeZone={cronTimezone}
            keyword={keyword}
            taskId={recordJobId}
            onTaskChange={setRecordJobId}
            revision={recordsRevision}
          />
        ) : showBodySpinner ? (
          <div className={styles.firstLoad}>
            <Spin />
          </div>
        ) : showEmpty ? (
          <CronJobsEmptyState
            onCreate={handleCreate}
            onSuggestionClick={handleSuggestionClick}
            suggestions={taskExamples}
          />
        ) : (
          <div
            className={`${styles.listShell} ${
              contentBusy ? styles.listShellBusy : ""
            }`}
          >
            {contentBusy ? (
              <div className={styles.listBusyBar} aria-hidden>
                <Spin size="small" />
              </div>
            ) : null}
            {filteredJobs.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={t("cronJobs.workbuddy.noMatches")}
              />
            ) : showCardView ? (
              <div className={styles.cardGrid}>
                {filteredJobs.map((job) => (
                  <CronJobCard
                    key={job.id}
                    job={job}
                    timeZone={cronTimezone}
                    onDetail={handleDetail}
                    onViewRecords={viewRecords}
                    onToggleEnabled={handleToggleEnabled}
                    onExecuteNow={handleExecuteNow}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            ) : (
              <ResizableTable
                className={styles.cronTable}
                columns={columns}
                dataSource={filteredJobs}
                rowKey="id"
                size="middle"
                tableLayout="fixed"
                scroll={{ x: 1562 }}
                storageKey="cron-jobs-table-widths"
                minWidth={72}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: false,
                  showTotal: (total) =>
                    t("cronJobs.totalItems", { count: total }),
                }}
              />
            )}
          </div>
        )}
      </div>
      <JobDrawer
        open={drawerOpen}
        editingJob={editingJob}
        activeAgentId={activeAgentId}
        cronTimezone={cronTimezone}
        form={form}
        onClose={handleDrawerClose}
        onSubmit={handleSubmit}
      />

      <JobDetailDrawer
        open={detailDrawerOpen}
        job={detailJob}
        timeZone={cronTimezone}
        onClose={handleDetailClose}
      />

      <ExecuteNowModal
        open={executingJob !== null}
        job={executingJob}
        loading={executing}
        onCancel={handleExecuteNowCancel}
        onConfirm={handleExecuteNowConfirm}
      />
    </PageShell>
  );
}

export default CronJobsPage;
