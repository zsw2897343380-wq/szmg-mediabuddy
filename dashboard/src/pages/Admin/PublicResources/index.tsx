import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Input, Space, Switch, Table, Tabs, Tag } from "antd";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import PageShell from "../../../layouts/PageShell";
import ForbiddenPage from "../../../components/ForbiddenPage";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import {
  publicResourcesApi,
  type PublicResource,
} from "../../../api/modules/publicResources";
import { apiErrorMessage } from "../../../utils/apiError";
import { userCan } from "../../../utils/permissions";

export default function PublicResourcesPage() {
  const user = useCurrentUser();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "experts";
  const [rows, setRows] = useState<PublicResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<unknown>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await publicResourcesApi.list());
    } catch (err: unknown) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (userCan(user, "public_resources.view")) void refresh();
  }, [user, refresh]);
  if (!userCan(user, "public_resources.view")) return <ForbiddenPage />;
  const canPublish = userCan(user, `public_resources.${tab}`);
  const visible = rows.filter(
    (row) =>
      row.category === tab &&
      `${row.name} ${row.description} ${row.resource_id}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const update = async (items: PublicResource[], enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      for (const source of new Set(items.map((row) => row.resource_type))) {
        await publicResourcesApi.update(
          source,
          items
            .filter((row) => row.resource_type === source)
            .map((row) => row.resource_id),
          enabled,
        );
      }
      await refresh();
    } catch (err: unknown) {
      setError(err);
      await refresh();
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PageShell title={t("nav.publicResources")}>
      <Alert
        type="info"
        showIcon
        message={t("publicResources.description")}
        style={{ marginBottom: 16 }}
      />
      <Tabs
        activeKey={tab}
        onChange={(key) => setParams({ tab: key })}
        items={(["experts", "skills", "connectors"] as const).map((key) => ({
          key,
          label: t(`nav.${key}`),
        }))}
      />
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          aria-label={t("publicResources.search")}
          placeholder={t("publicResources.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
        <Button onClick={() => void refresh()} disabled={busy}>
          {t("common.refresh")}
        </Button>
        <Button
          disabled={!canPublish || busy || !visible.some((row) => row.enabled)}
          onClick={() =>
            void update(
              visible.filter((row) => row.enabled),
              false,
            )
          }
        >
          {t("publicResources.disableVisible")}
        </Button>
        <Button
          disabled={!canPublish || busy || !visible.some((row) => !row.enabled)}
          onClick={() =>
            void update(
              visible.filter((row) => !row.enabled),
              true,
            )
          }
        >
          {t("publicResources.enableVisible")}
        </Button>
      </Space>
      {error ? (
        <Alert
          type="error"
          showIcon
          message={apiErrorMessage(error, t("publicResources.failed"), t)}
        />
      ) : null}
      <Table<PublicResource>
        loading={loading}
        rowKey={(row) => `${row.resource_type}/${row.resource_id}`}
        dataSource={visible}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        columns={[
          {
            title: t("publicResources.name"),
            dataIndex: "name",
            render: (name, row) => (
              <>
                <strong>{name}</strong>
                <div style={{ color: "var(--fn-color-text-secondary)" }}>
                  {row.description}
                </div>
              </>
            ),
          },
          {
            title: t("publicResources.source"),
            dataIndex: "resource_type",
            width: 160,
            render: (type: string) => (
              <Tag>{t(`publicResources.sources.${type}`)}</Tag>
            ),
          },
          {
            title: t("publicResources.availability"),
            width: 150,
            render: (_, row) => (
              <Switch
                aria-label={t("publicResources.toggle", { name: row.name })}
                disabled={
                  busy || !userCan(user, `public_resources.${row.category}`)
                }
                checked={row.enabled}
                checkedChildren={t("publicResources.published")}
                unCheckedChildren={t("publicResources.withdrawn")}
                onChange={(value) => void update([row], value)}
              />
            ),
          },
        ]}
      />
    </PageShell>
  );
}
