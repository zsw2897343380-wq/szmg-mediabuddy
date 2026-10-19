import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Empty } from "antd";
import { Glasses, Hammer, Link2 } from "lucide-react";
import PageLoading from "../../components/PageLoading";
import { useAgent } from "../../context/AgentContext";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { isTeamAgent } from "../../utils/teamAgent";
import { navAllowed, userCan } from "../../utils/permissions";
import { CapabilityHeaderContext } from "./HeaderActions";
import styles from "./index.module.less";

const ExpertsPage = lazy(() => import("../Experts"));
const ConnectorsPage = lazy(() => import("../Agent/Connectors"));
const SkillPackagesPage = lazy(() => import("../SkillPackages"));
const SkillsTabs = lazy(() => import("../Agent/Skills/components/SkillsTabs"));

type ResourceTab = "experts" | "skills" | "connectors";

export default function CapabilityCenter() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const user = useCurrentUser();
  const { activeAgentId, activeAgent } = useAgent();
  const activeTab: ResourceTab =
    pathname === "/connectors"
      ? "connectors"
      : pathname === "/skills" || pathname === "/skill-packages"
      ? "skills"
      : "experts";
  const [visited, setVisited] = useState<Set<string>>(
    () => new Set([pathname]),
  );
  const [skillsPath, setSkillsPath] = useState(
    pathname === "/skill-packages" ? "/skill-packages" : "/skills",
  );
  const [headerElement, setHeaderElement] = useState<HTMLDivElement | null>(
    null,
  );
  const canExperts = navAllowed(user, "experts");
  const canSkills = userCan(user, "skills");
  const canConnectors = navAllowed(user, "connectors");
  const canPackages = navAllowed(user, "skill-packages");
  const skillsLink = skillsPath;
  const onPackages =
    (activeTab === "skills" ? pathname : skillsPath) === "/skill-packages";

  useEffect(() => {
    setVisited((prev) =>
      prev.has(pathname) ? prev : new Set([...prev, pathname]),
    );
    if (activeTab === "skills") setSkillsPath(pathname);
  }, [activeTab, pathname]);

  const tabs = [
    ...(canExperts
      ? [
          {
            key: "experts",
            path: "/experts",
            label: "nav.experts",
            Icon: Glasses,
          },
        ]
      : []),
    ...(canSkills || canPackages
      ? [
          {
            key: "skills",
            path: skillsLink,
            label: "nav.skills",
            Icon: Hammer,
          },
        ]
      : []),
    ...(canConnectors
      ? [
          {
            key: "connectors",
            path: "/connectors",
            label: "nav.connectors",
            Icon: Link2,
          },
        ]
      : []),
  ];

  return (
    <CapabilityHeaderContext.Provider
      value={{
        element: headerElement,
        resource: onPackages && activeTab === "skills" ? null : activeTab,
      }}
    >
      <div className={styles.center}>
        <header className={styles.header}>
          <nav className={styles.tabs} aria-label={t("capabilityCenter.title")}>
            {tabs.map(({ key, path, label, Icon }) => (
              <Link
                key={key}
                to={path}
                aria-current={activeTab === key ? "page" : undefined}
              >
                <Icon size={19} strokeWidth={1.8} />
                {t(label)}
              </Link>
            ))}
          </nav>
          <div className={styles.headerActions} ref={setHeaderElement}>
            {activeTab === "skills" && onPackages && (
              <Link to="/skills">{t("nav.skills")}</Link>
            )}
          </div>
        </header>
        <div className={styles.content}>
          {canExperts &&
            (visited.has("/experts") || activeTab === "experts") && (
              <section
                className={styles.panel}
                hidden={activeTab !== "experts"}
                aria-label={t("nav.experts")}
              >
                <Suspense fallback={<PageLoading />}>
                  <ExpertsPage embedded />
                </Suspense>
              </section>
            )}
          {(canSkills || canPackages) &&
            (visited.has("/skills") ||
              visited.has("/skill-packages") ||
              activeTab === "skills") && (
              <section
                className={styles.panel}
                hidden={activeTab !== "skills"}
                aria-label={t("nav.skills")}
              >
                {(canSkills || canPackages) &&
                  (visited.has("/skills") || !onPackages) && (
                    <div className={styles.panel} hidden={onPackages}>
                      <Suspense fallback={<PageLoading />}>
                        {canPackages ? (
                          <SkillPackagesPage embedded unified />
                        ) : isTeamAgent(activeAgent) ? (
                          <Empty
                            description={t("agentSelector.teamNeedsExpert", {
                              name: activeAgent?.name ?? "",
                            })}
                          />
                        ) : (
                          <>
                            {activeAgent?.bridge && (
                              <Alert
                                type="info"
                                showIcon
                                message={t("chat.remoteExpert.editBanner")}
                                description={t(
                                  "chat.remoteExpert.editSkillPackages",
                                )}
                                style={{ marginBottom: 12 }}
                              />
                            )}
                            <SkillsTabs agentId={activeAgentId} />
                          </>
                        )}
                      </Suspense>
                    </div>
                  )}
                {canPackages &&
                  (visited.has("/skill-packages") || onPackages) && (
                    <div className={styles.panel} hidden={!onPackages}>
                      <Suspense fallback={<PageLoading />}>
                        <SkillPackagesPage embedded />
                      </Suspense>
                    </div>
                  )}
              </section>
            )}
          {canConnectors &&
            (visited.has("/connectors") || activeTab === "connectors") && (
              <section
                className={styles.panel}
                hidden={activeTab !== "connectors"}
                aria-label={t("nav.connectors")}
              >
                <Suspense fallback={<PageLoading />}>
                  <ConnectorsPage embedded />
                </Suspense>
              </section>
            )}
        </div>
      </div>
    </CapabilityHeaderContext.Provider>
  );
}
