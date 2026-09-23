"use client";
import { useEffect } from "react";

/**
 * Recovers a tab that was left open across a deploy.
 *
 * Chunk filenames are content-hashed and `output: "standalone"` means every
 * deploy is a fresh container carrying ONLY the new build — the previous
 * build's files are gone, not kept alongside. A tab loaded before a deploy
 * still holds the old chunk map, so the first interaction that needs a chunk it
 * has not already downloaded (a route not yet visited, the task panel, any
 * lazily-loaded component) requests a file that now 404s.
 *
 * Nothing caught that. The rejected import surfaced nowhere, the page kept
 * looking perfect because it was already hydrated, and the click simply did
 * nothing — which reads as "the app froze" and was worked around by reloading
 * by hand. This turns that into the reload it was always going to need.
 *
 * Deliberately a listener rather than an error boundary: the failure is a
 * rejected dynamic import inside an already-running tree, not an error thrown
 * during render, so no boundary is positioned to see it.
 */

/*
 * Matched against the message because none of these arrive with a useful
 * `name`: only webpack ever threw a real `ChunkLoadError`, and Turbopack emits
 * native ESM imports whose failure is worded differently by every engine.
 */
const STALE_CHUNK_MESSAGES = [
  "ChunkLoadError",
  "Loading chunk",
  "Loading CSS chunk",
  "Failed to fetch dynamically imported module", // Chromium
  "error loading dynamically imported module", // Firefox
  "Importing a module script failed", // Safari
];

const RELOAD_MARK = "pm:stale-build-reload";

/*
 * A reload loop is worse than the dead page it replaces. If the fresh build
 * still cannot serve the chunk — a genuinely broken deploy, an origin that is
 * down — one reload is a recovery and ten is a pinwheel, so a second attempt
 * inside this window is refused and the original error is left to stand.
 */
const RELOAD_COOLDOWN_MS = 30_000;

function messageOf(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (reason && typeof reason === "object" && "message" in reason) {
    return String((reason as { message: unknown }).message);
  }
  return "";
}

/** A `<script>`/`<link>` that failed to load reports no message at all — the
 *  only signal is the element and its URL, so it is matched separately. */
function isStaleAssetElement(target: EventTarget | null): boolean {
  const url =
    target instanceof HTMLScriptElement ? target.src
    : target instanceof HTMLLinkElement ? target.href
    : null;
  return !!url && url.includes("/_next/static/");
}

export function StaleBuildReloader() {
  useEffect(() => {
    let reloading = false;

    const recover = () => {
      if (reloading) return;
      try {
        const last = Number(sessionStorage.getItem(RELOAD_MARK) ?? 0);
        if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
        sessionStorage.setItem(RELOAD_MARK, String(Date.now()));
      } catch {
        // Private mode / storage denied. One reload is still better than a
        // page that cannot be clicked; only the loop guard is lost.
      }
      reloading = true;
      window.location.reload();
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = messageOf(e.reason);
      if (STALE_CHUNK_MESSAGES.some((m) => msg.includes(m))) recover();
    };

    const onError = (e: ErrorEvent) => {
      if (isStaleAssetElement(e.target)) return recover();
      if (STALE_CHUNK_MESSAGES.some((m) => (e.message ?? "").includes(m))) recover();
    };

    window.addEventListener("unhandledrejection", onRejection);
    // Capture: a failed resource load fires on the element and does not bubble.
    window.addEventListener("error", onError, true);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError, true);
    };
  }, []);

  return null;
}
