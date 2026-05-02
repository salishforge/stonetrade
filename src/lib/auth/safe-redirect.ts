/**
 * Resolve a user-supplied post-login redirect target to a safe path.
 *
 * `?next=` is user-controlled, so it cannot be passed to redirect() as-is —
 * an attacker could craft `?next=https://evil.com` and use the post-login
 * URL as a phishing primitive. We accept ONLY same-origin paths, identified
 * by:
 *   - leading "/" (relative path on this origin)
 *   - not "//foo" (protocol-relative — resolves to a different host)
 *   - no backslashes (some browsers normalise `\` into protocol boundaries)
 *
 * Anything else falls back to "/" — the safe default.
 */
export function resolveSafeNext(rawNext: string | null | undefined): string {
  if (!rawNext) return "/";
  if (!rawNext.startsWith("/") || rawNext.startsWith("//")) return "/";
  if (rawNext.includes("\\")) return "/";
  return rawNext;
}
