/** Refresh mounted skill pickers after a successful library or package change. */
export const SKILLS_UPDATED = "octop:skills-updated";

export function notifySkillsUpdated(): void {
  window.dispatchEvent(new Event(SKILLS_UPDATED));
}
