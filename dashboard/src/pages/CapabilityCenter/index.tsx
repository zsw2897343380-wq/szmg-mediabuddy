import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GraduationCap, Link2, Sparkles } from "lucide-react";
import AgentSelector from "../../components/AgentSelector";
import PageLoading from "../../components/PageLoading";
import { useAgent } from "../../context/AgentContext";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { navAllowed } from "../../utils/permissions";
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
  const { activeAgentId } = useAgent();
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
  const canConnectors = navAllowed(user, "connectors");
  const canPackages = navAllowed(user, "skill-packages");
  const onPackages =
    (activeTab === "skills" ? pathname : skillsPath) === "/skill-packages";

  useEffect(() => {
    setVisited((prev) =>
      prev.has(pathname) ? prev : new Set([...prev, pathname]),
    );
    if (activeTab === "skills") setSkillsPath(pathname);
  }, [activeTab, pathname]);

  const tabs = [
    {
      key: "experts",
      path: "/experts",
      label: "nav.experts",
      Icon: GraduationCap,
    },
    { key: "skills", path: skillsPath, label: "nav.skills", Icon: Sparkles },
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
    <div className={styles.center}>
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
      <div className={styles.content}>
        {(visited.has("/experts") || activeTab === "experts") && (
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
        {(visited.has("/skills") ||
          visited.has("/skill-packages") ||
          activeTab === "skills") && (
          <section
            className={styles.panel}
            hidden={activeTab !== "skills"}
            aria-label={t("nav.skills")}
          >
            <div className={styles.skillsToolbar}>
              <nav
                className={styles.skillViews}
                aria-label={t("capabilityCenter.skillsManagement")}
              >
                <Link
                  to="/skills"
                  aria-current={!onPackages ? "page" : undefined}
                >
                  {t("capabilityCenter.agentSkills")}
                </Link>
                {canPackages && (
                  <Link
                    to="/skill-packages"
                    aria-current={onPackages ? "page" : undefined}
                  >
                    {t("capabilityCenter.skillPackages")}
                  </Link>
                )}
              </nav>
              {!onPackages && <AgentSelector />}
            </div>
            {(visited.has("/skills") || !onPackages) && (
              <div className={styles.panel} hidden={onPackages}>
                <Suspense fallback={<PageLoading />}>
                  <SkillsTabs agentId={activeAgentId} />
                </Suspense>
              </div>
            )}
            {canPackages && (visited.has("/skill-packages") || onPackages) && (
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
  );
}
