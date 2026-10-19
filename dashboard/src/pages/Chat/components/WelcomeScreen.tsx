import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Hammer, ListTodo, MessageCircleQuestion } from "lucide-react";
import WelcomeQuickCards from "./WelcomeQuickCards";
import type { ConversationMode } from "../utils/conversationMode";
import styles from "../index.module.less";

// Animated WebP keeps alpha on Safari; VP9 WebM alpha is unreliable there.
const MASCOT_PEEK = "/octop-mascot-peek.webp";
const MASCOT_TYPE = "/octop-mascot-type.webp";
const MASCOT_IMAGES = [MASCOT_PEEK, MASCOT_TYPE];

function getRandomMascot(current?: string): string {
  if (MASCOT_IMAGES.length <= 1) return MASCOT_IMAGES[0];
  let next = current;
  // Avoid picking the same image twice in a row.
  while (next === current) {
    next = MASCOT_IMAGES[Math.floor(Math.random() * MASCOT_IMAGES.length)];
  }
  return next as string;
}

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
  hideMascot?: boolean;
  isTeam?: boolean;
  conversationMode: ConversationMode;
  onConversationModeChange: (mode: ConversationMode) => void;
}

export default function WelcomeScreen({
  agentName,
  welcomeSuffix,
  hideMascot = false,
  isTeam = false,
  conversationMode,
  onConversationModeChange,
}: WelcomeScreenProps) {
  const { t } = useTranslation();
  const [mascotSrc, setMascotSrc] = useState(MASCOT_PEEK);

  const handleMascotClick = () => {
    setMascotSrc((prev) => getRandomMascot(prev));
  };

  const showMascot = !hideMascot;

  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeInner}>
        <div className={styles.welcomeHeading}>
          {showMascot && (
            <img
              className={styles.welcomeMascot}
              src={mascotSrc}
              alt=""
              draggable={false}
              onClick={handleMascotClick}
              role="button"
              tabIndex={0}
              title={t("chatWelcome.mascotSwitchHint")}
              aria-label={t("chatWelcome.mascotSwitchHint")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleMascotClick();
                }
              }}
            />
          )}
          <h1 className={styles.welcomeTitle}>
            {isTeam
              ? t("chatWelcome.teamHeading", {
                  name: agentName?.trim() || t("chatWelcome.teamNameFallback"),
                })
              : t("chatWelcome.greeting")}
          </h1>
          <p className={styles.welcomeSubtitle}>
            {isTeam ? (
              <span className={styles.welcomeSubtitleText}>
                {welcomeSuffix ?? t("chatWelcome.descriptionWithTeamSuffix")}
              </span>
            ) : agentName ? (
              <>
                <span className={styles.welcomeAgentLine}>
                  <span className={styles.welcomeAgentMention}>
                    @{agentName}
                  </span>
                </span>
                <span className={styles.welcomeSubtitleText}>
                  {welcomeSuffix ?? t("chatWelcome.descriptionWithAgentSuffix")}
                </span>
              </>
            ) : (
              t("chatWelcome.description")
            )}
          </p>
        </div>

        <div
          className={styles.welcomeModes}
          role="group"
          aria-label={t("chat.conversationMode.picker")}
        >
          {(
            [
              { mode: "craft", Icon: Hammer },
              { mode: "plan", Icon: ListTodo },
              { mode: "ask", Icon: MessageCircleQuestion },
            ] as const
          ).map(({ mode, Icon }) => (
            <button
              key={mode}
              type="button"
              aria-pressed={conversationMode === mode}
              title={t(`chat.conversationMode.${mode}Hint`)}
              onClick={() => onConversationModeChange(mode)}
            >
              <Icon size={15} />
              {t(`chat.conversationMode.${mode}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function WelcomeSuggestions({
  quickCards,
  onPromptClick,
}: {
  quickCards: WelcomeQuickCard[];
  onPromptClick: (text: string, options?: { prefill?: boolean }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={styles.welcomeSuggestions}>
      <WelcomeQuickCards
        cards={expanded ? quickCards : quickCards.slice(0, 4)}
        showToggle={quickCards.length > 4}
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
        onPromptClick={onPromptClick}
      />
    </div>
  );
}
