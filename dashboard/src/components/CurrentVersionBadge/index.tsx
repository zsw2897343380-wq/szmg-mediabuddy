import styles from "./index.module.less";

interface CurrentVersionBadgeProps {
  isMobile?: boolean;
}

export default function CurrentVersionBadge({
  isMobile,
}: CurrentVersionBadgeProps) {
  return (
    <span
      className={`${styles.versionBadge} ${
        isMobile ? styles.versionBadgeMobile : ""
      }`}
      aria-label="MediaBuddy"
    >
      MediaBuddy
    </span>
  );
}
