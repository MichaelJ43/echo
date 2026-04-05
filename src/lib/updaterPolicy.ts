/** Pure policy for when the automatic update toast may appear (tests use this). */

export function isAutoUpdatePromptBlocked(
  suppressForever: boolean,
  dismissedThisSession: boolean,
  snoozeUntilMs: number,
  nowMs: number
): boolean {
  if (suppressForever) return true;
  if (dismissedThisSession && nowMs < snoozeUntilMs) return true;
  return false;
}
