import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { isAutoUpdatePromptBlocked } from "./updaterPolicy";

const HOUR_MS = 60 * 60 * 1000;

const LS_SUPPRESS = "echo.updater.suppress";
const LS_SNOOZE_UNTIL = "echo.updater.snoozeUntil";
const SS_DISMISSED = "echo.updater.dismissedThisSession";

/** Matches `endpoints` in `src-tauri/tauri.conf.json` (GitHub Releases). */
export const GITHUB_RELEASES_LATEST_URL = "https://github.com/MichaelJ43/echo/releases/latest";

function readSuppress(): boolean {
  try {
    return localStorage.getItem(LS_SUPPRESS) === "1";
  } catch {
    return false;
  }
}

function readSnoozeUntil(): number {
  try {
    const v = parseInt(localStorage.getItem(LS_SNOOZE_UNTIL) || "0", 10);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

function readDismissedSession(): boolean {
  try {
    return sessionStorage.getItem(SS_DISMISSED) === "1";
  } catch {
    return false;
  }
}

export function shouldShowAutoUpdatePrompt(nowMs: number = Date.now()): boolean {
  return !isAutoUpdatePromptBlocked(readSuppress(), readDismissedSession(), readSnoozeUntil(), nowMs);
}

/** Dismiss: hide until next app launch or until 1 hour after dismiss (same session). */
export function recordUpdatePromptDismissed(): void {
  try {
    sessionStorage.setItem(SS_DISMISSED, "1");
    localStorage.setItem(LS_SNOOZE_UNTIL, String(Date.now() + HOUR_MS));
  } catch {
    /* ignore */
  }
}

export function recordSuppressUpdateNotificationsForever(): void {
  try {
    localStorage.setItem(LS_SUPPRESS, "1");
  } catch {
    /* ignore */
  }
}

export async function fetchUpdateIfAvailable(): Promise<Update | null> {
  if (!isTauri()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  return await check();
}

/** Respects dismiss / suppress; skips network when auto prompts are blocked. */
export async function fetchUpdateForAutoPrompt(): Promise<Update | null> {
  if (!isTauri()) return null;
  if (!shouldShowAutoUpdatePrompt()) return null;
  return await fetchUpdateIfAvailable();
}

export async function openGitHubReleasesPage(): Promise<void> {
  if (isTauri()) {
    await invoke("open_external_url", { url: GITHUB_RELEASES_LATEST_URL });
    return;
  }
  window.open(GITHUB_RELEASES_LATEST_URL, "_blank", "noopener,noreferrer");
}

export type UpdateCheckScheduler = {
  /** Run one check now (e.g. manual “Check for updates”). */
  checkNow: () => Promise<Update | null>;
  dispose: () => void;
};

/**
 * Periodic auto-check (hourly + once at start). Callback only when an update exists
 * and {@link shouldShowAutoUpdatePrompt} is true at check time.
 */
export function startUpdateCheckScheduler(
  onUpdateAvailable: (update: Update) => void,
  onCheckError?: (err: unknown) => void
): UpdateCheckScheduler {
  if (!isTauri()) {
    return {
      checkNow: async () => null,
      dispose: () => {},
    };
  }

  let disposed = false;

  const tick = async () => {
    if (disposed) return;
    try {
      const u = await fetchUpdateForAutoPrompt();
      if (u) onUpdateAvailable(u);
    } catch (e) {
      console.warn("[updater] check failed", e);
      onCheckError?.(e);
    }
  };

  void tick();
  const id = setInterval(() => void tick(), HOUR_MS);

  return {
    checkNow: () => fetchUpdateIfAvailable(),
    dispose: () => {
      disposed = true;
      clearInterval(id);
    },
  };
}
