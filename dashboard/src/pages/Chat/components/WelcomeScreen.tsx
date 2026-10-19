import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Coffee,
  CodeXml,
  Palette,
} from "lucide-react";
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

export type WelcomeCategory = (typeof SCENE_CATEGORIES)[WelcomeScene][number];

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
  selectedCategory = null,
  onCategoryChange,
  onPromptClick,
}: {
  scene: WelcomeScene;
  selectedCategory?: WelcomeCategory | null;
  onCategoryChange?: (category: WelcomeCategory | null) => void;
  onPromptClick: (text: string, options?: { prefill?: boolean }) => void;
}) {
  const { t, i18n } = useTranslation();
  const categoriesRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const list = categoriesRef.current;
    if (!list) return;
    list.scrollLeft = 0;
    const updateEdges = () =>
      setScrollEdges({
        left: list.scrollLeft > 1,
        right: list.scrollWidth - list.clientWidth - list.scrollLeft > 1,
      });
    updateEdges();
    list.addEventListener("scroll", updateEdges);
    const observer = new ResizeObserver(updateEdges);
    observer.observe(list);
    return () => {
      observer.disconnect();
      list.removeEventListener("scroll", updateEdges);
    };
  }, [scene, i18n.language]);

  const scroll = (direction: -1 | 1) => {
    const list = categoriesRef.current;
    list?.scrollBy({
      left: direction * list.clientWidth * 0.7,
      behavior: "smooth",
    });
  };

  return (
    <div className={styles.welcomeComposerHeader}>
      <div className={styles.welcomeCategoryStrip}>
        {scrollEdges.left && (
          <button
            type="button"
            className={`${styles.welcomeCategoryArrow} ${styles.welcomeCategoryArrowLeft}`}
            aria-label={t("chatWelcome.previousCategories")}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <div
          ref={categoriesRef}
          className={styles.welcomeCategories}
          role="group"
          aria-label={t("chatWelcome.categories.label")}
        >
          {SCENE_CATEGORIES[scene].map((category) => (
            <button
              type="button"
              key={category}
              aria-pressed={selectedCategory === category}
              onClick={() => {
                const next = selectedCategory === category ? null : category;
                onCategoryChange?.(next);
                onPromptClick(
                  next ? t(`chatWelcome.categories.${next}.prompt`) : "",
                  { prefill: true },
                );
              }}
            >
              {t(`chatWelcome.categories.${category}.label`)}
            </button>
          ))}
        </div>
        {scrollEdges.right && (
          <button
            type="button"
            className={`${styles.welcomeCategoryArrow} ${styles.welcomeCategoryArrowRight}`}
            aria-label={t("chatWelcome.nextCategories")}
            onClick={() => scroll(1)}
          >
            <ChevronRight size={16} />
          </button>
        )}
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
  selectedCategory = null,
}: {
  quickCards: WelcomeQuickCard[];
  onPromptClick: (text: string, options?: { prefill?: boolean }) => void;
  scene?: WelcomeScene;
  selectedCategory?: WelcomeCategory | null;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const cards = selectedCategory
    ? [1, 2, 3, 4].map((index) => {
        const prompt = t(
          `chatWelcome.taskSuggestions.${selectedCategory}.${index}`,
        );
        return { title: prompt, description: prompt, prompt, color: "#888888" };
      })
    : scene === "office"
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
