import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Coffee, CodeXml, Palette } from "lucide-react";
import WelcomeQuickCards from "./WelcomeQuickCards";
import styles from "../index.module.less";

export type WelcomeScene = "office" | "code" | "design";

const SCENE_CATEGORIES = {
  office: [
    "chat",
    "document",
    "finance",
    "data",
    "slides",
    "research",
    "plan",
    "website",
  ],
  code: ["website", "debug", "tests", "refactor", "automation"],
  design: ["prototype", "poster", "presentation", "illustration"],
} as const;

export interface WelcomeQuickCard {
  title: string;
  description: string;
  prompt: string;
  color: string;
  icon_name?: string | null;
  icon_url?: string | null;
  expertName?: string;
}

interface WelcomeScreenProps {
  agentName?: string | null;
  welcomeSuffix?: string | null;
  isTeam?: boolean;
  scene: WelcomeScene;
  onSceneChange: (scene: WelcomeScene) => void;
}

export default function WelcomeScreen({
  agentName,
  welcomeSuffix,
  isTeam = false,
  scene,
  onSceneChange,
}: WelcomeScreenProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeInner}>
        <div className={styles.welcomeHeading}>
          <h1 className={styles.welcomeTitle}>
            {isTeam
              ? t("chatWelcome.teamHeading", {
                  name: agentName?.trim() || t("chatWelcome.teamNameFallback"),
                })
              : t("chatWelcome.greeting")}
          </h1>
          {isTeam && (
            <p className={styles.welcomeSubtitle}>
              {welcomeSuffix ?? t("chatWelcome.descriptionWithTeamSuffix")}
            </p>
          )}
        </div>
        <div
          className={styles.welcomeModes}
          role="group"
          aria-label={t("chatWelcome.scenes.label")}
        >
          {(
            [
              { key: "office", Icon: Coffee },
              { key: "code", Icon: CodeXml },
              { key: "design", Icon: Palette },
            ] as const
          ).map(({ key, Icon }) => (
            <button
              key={key}
              type="button"
              aria-pressed={scene === key}
              onClick={() => onSceneChange(key)}
            >
              <Icon size={16} />
              {t(`chatWelcome.scenes.${key}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WelcomeComposerHeader({
  scene,
  onPromptClick,
}: {
  scene: WelcomeScene;
  onPromptClick: (text: string, options?: { prefill?: boolean }) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={styles.welcomeComposerHeader}>
      <div
        className={styles.welcomeCategories}
        role="group"
        aria-label={t("chatWelcome.categories.label")}
      >
        {SCENE_CATEGORIES[scene].map((category) => (
          <button
            type="button"
            key={category}
            onClick={() =>
              onPromptClick(t(`chatWelcome.categories.${category}.prompt`), {
                prefill: true,
              })
            }
          >
            {t(`chatWelcome.categories.${category}.label`)}
          </button>
        ))}
      </div>
      <img
        className={styles.welcomeMascot}
        src="/octop-mascot-peek.webp"
        alt=""
        draggable={false}
      />
    </div>
  );
}

export function WelcomeSuggestions({
  quickCards,
  onPromptClick,
  scene = "office",
}: {
  quickCards: WelcomeQuickCard[];
  onPromptClick: (text: string, options?: { prefill?: boolean }) => void;
  scene?: WelcomeScene;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const cards =
    scene === "office"
      ? quickCards
      : SCENE_CATEGORIES[scene].map((category) => ({
          title: t(`chatWelcome.categories.${category}.label`),
          description: t(`chatWelcome.categories.${category}.prompt`),
          prompt: t(`chatWelcome.categories.${category}.prompt`),
          color: "#888888",
        }));
  return (
    <div className={styles.welcomeSuggestions}>
      <WelcomeQuickCards
        cards={expanded ? cards : cards.slice(0, 4)}
        showToggle={cards.length > 4}
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
        onPromptClick={onPromptClick}
      />
    </div>
  );
}
