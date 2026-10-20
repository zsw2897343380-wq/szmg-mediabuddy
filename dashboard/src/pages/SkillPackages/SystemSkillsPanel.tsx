import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Empty, Spin, Switch } from "antd";
import { useTranslation } from "react-i18next";
import {
  publicResourcesApi,
  type PublicResource,
} from "../../api/modules/publicResources";
import { apiErrorMessage } from "../../utils/apiError";
import styles from "./UnifiedSkillLibrary.module.less";

export default function SystemSkillsPanel({
  query,
  revision,
}: {
  query: string;
  revision: number;
}) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<PublicResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSkills(
        (await publicResourcesApi.list()).filter(
          (item) => item.resource_type === "builtin_skill",
        ),
      );
    } catch (err) {
      setError(apiErrorMessage(err, t("skillPackages.loadFailed"), t));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => {
    void refresh();
  }, [refresh, revision]);
  const update = async (skill: PublicResource, enabled: boolean) => {
    setBusy(skill.resource_id);
    setError("");
    try {
      await publicResourcesApi.update(
        "builtin_skill",
        [skill.resource_id],
        enabled,
      );
      setSkills((items) =>
        items.map((item) =>
          item.resource_id === skill.resource_id ? { ...item, enabled } : item,
        ),
      );
    } catch (err) {
      setError(apiErrorMessage(err, t("skillsCenter.systemUpdateFailed"), t));
    } finally {
      setBusy(null);
    }
  };
  const needle = query.trim().toLocaleLowerCase();
  const visible = skills.filter((skill) =>
    [skill.name, skill.resource_id, skill.description].some((text) =>
      text.toLocaleLowerCase().includes(needle),
    ),
  );
  return (
    <>
      <Alert type="info" showIcon message={t("skillsCenter.systemPolicy")} />
      {error && (
        <Alert
          type="error"
          message={error}
          action={
            <Button onClick={() => void refresh()}>{t("common.retry")}</Button>
          }
        />
      )}
      {loading ? (
        <div className={styles.loading}>
          <Spin />
        </div>
      ) : (
        <div className={styles.grid}>
          {visible.map((skill) => (
            <div
              className={`${styles.card} ${
                skill.enabled ? "" : styles.disabled
              }`}
              key={skill.resource_id}
            >
              <div className={styles.cardBody}>
                <div className={styles.cardName}>{skill.name}</div>
                <div
                  className={styles.cardDescription}
                  title={skill.description}
                >
                  {skill.description}
                </div>
                <small>{skill.resource_id}</small>
              </div>
              <Switch
                checked={skill.enabled}
                disabled={busy !== null}
                loading={busy === skill.resource_id}
                aria-label={t("skillsCenter.systemToggle", {
                  name: skill.name,
                })}
                onChange={(enabled) => void update(skill, enabled)}
              />
            </div>
          ))}
          {!visible.length && !error && <Empty />}
        </div>
      )}
    </>
  );
}
