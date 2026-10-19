import { useEffect, useState } from "react";
import { Button, Result, Spin } from "antd";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { defaultChatApi } from "../../../api/modules/defaultChat";
import { useAgent } from "../../../context/AgentContext";
import { useCurrentUser } from "../../../hooks/useCurrentUser";
import { apiErrorMessage } from "../../../utils/apiError";
import { navAllowed } from "../../../utils/permissions";
import styles from "../index.module.less";

/** Resolve the user's general runtime without requiring a specialist selection. */
export default function GeneralChatEntry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useCurrentUser();
  const { refresh, setActiveAgent } = useAgent();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setError(null);
    void defaultChatApi
      .ensure()
      .then(async ({ agent_id }) => {
        if (cancelled) return;
        await refresh({ silent: true, force: true });
        if (cancelled) return;
        setActiveAgent(agent_id);
        navigate(`/chat/${encodeURIComponent(agent_id)}`, {
          replace: true,
          state: {
            ...(location.state as Record<string, unknown> | null),
            newChat: true,
          },
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, attempt, refresh, setActiveAgent, navigate, location.state]);

  return (
    <div className={styles.agentNotReady}>
      {error ? (
        <Result
          status="error"
          title={t("chat.generalChat.failed")}
          subTitle={apiErrorMessage(error, t("chat.generalChat.failed"), t)}
          extra={
            <>
              <Button
                type="primary"
                onClick={() => setAttempt((value) => value + 1)}
              >
                {t("common.retry")}
              </Button>
              {navAllowed(user, "models") && (
                <Button onClick={() => navigate("/admin/models")}>
                  {t("modelConfig.configureButton")}
                </Button>
              )}
            </>
          }
        />
      ) : (
        <Spin tip={t("chat.generalChat.preparing")} />
      )}
    </div>
  );
}
