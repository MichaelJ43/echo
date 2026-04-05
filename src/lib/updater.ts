import { isTauri } from "@tauri-apps/api/core";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Checks for app updates (Tauri updater). No-op in the browser dev server.
 * Runs once on call, then every hour while the window is open.
 */
export function startUpdateChecks(): void {
  if (!isTauri()) return;

  const run = async () => {
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check();
      if (!update) return;
      await update.downloadAndInstall();
      await relaunch();
    } catch (e) {
      console.warn("[updater] check failed", e);
    }
  };

  void run();
  setInterval(() => void run(), HOUR_MS);
}
