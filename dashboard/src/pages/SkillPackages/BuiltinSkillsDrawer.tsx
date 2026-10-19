import { useEffect, useState } from "react";
import { Alert, Button, Drawer, Input, List, Spin, Switch } from "antd";
import { useTranslation } from "react-i18next";
import {
  builtinSkillsApi,
  type BuiltinSkill,
} from "../../api/modules/builtinSkills";
import { apiErrorMessage } from "../../utils/apiError";
import { builtinSkillIcon } from "../Agent/Skills/builtinSkillIcon";

export default function BuiltinSkillsDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<BuiltinSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void builtinSkillsApi
      .list()
      .then((rows) => {
        if (!cancelled) setSkills(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

  const update = async (slugs: string[], enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await builtinSkillsApi.update(slugs, enabled);
      setSkills((rows) =>
        rows.map((row) =>
          slugs.includes(row.slug) ? { ...row, enabled } : row,
        ),
      );
    } catch (err: unknown) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const enabled = skills.filter((skill) => skill.enabled);
  const visible = skills.filter((skill) =>
    `${skill.name} ${skill.slug} ${skill.description}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <Drawer
      title={t("skillsCenter.presets")}
      open={open}
      onClose={onClose}
      width={640}
    >
      <p>{t("skillsCenter.presetsDescription")}</p>
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <Input
          aria-label={t("skillsCenter.search")}
          placeholder={t("skillsCenter.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
        <Button
          disabled={loading || busy || !enabled.length}
          onClick={() =>
            void update(
              enabled.map((skill) => skill.slug),
              false,
            )
          }
        >
          {t("skillsCenter.disableAllPresets")}
        </Button>
      </div>
      {error ? (
        <Alert
          type="error"
          showIcon
          message={apiErrorMessage(error, t("skillLibrary.updateFailed"), t)}
          action={
            <Button onClick={() => setAttempt((value) => value + 1)}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : null}
      {loading ? (
        <Spin />
      ) : (
        <List
          dataSource={visible}
          renderItem={(skill) => (
            <List.Item
              actions={[
                <Switch
                  key="enabled"
                  aria-label={t("skillsCenter.enable", { name: skill.name })}
                  checked={skill.enabled}
                  disabled={busy}
                  checkedChildren={t("common.enabled")}
                  unCheckedChildren={t("common.disabled")}
                  onChange={(value) => void update([skill.slug], value)}
                />,
              ]}
            >
              <List.Item.Meta
                avatar={builtinSkillIcon(skill.slug, 32)}
                title={skill.name}
                description={skill.description}
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
}
