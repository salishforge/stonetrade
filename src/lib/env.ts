/**
 * Production environment validation.
 *
 * Survey-driven: the audit found three env vars used in code but missing
 * from `.env.example` (NEXT_PUBLIC_APP_URL, WONDERS_DECK_PLATFORM_API_URL,
 * WONDERSTRADINGPOST_ANON_KEY). The worst was NEXT_PUBLIC_APP_URL —
 * Stripe success/cancel redirects and alert emails default to
 * "http://localhost:3000" when it's unset, so production traffic would
 * silently route to localhost. This module fails loudly instead.
 *
 * Two severity bands:
 *   - **Required at boot**: missing → throw in production, log warning in
 *     dev. The app cannot function correctly without these (DATABASE_URL,
 *     NEXT_PUBLIC_APP_URL, AUTH_MODE-explicit, and the Supabase keys when
 *     AUTH_MODE=supabase).
 *   - **Required when feature is in use**: missing → never thrown here;
 *     the feature's own client (e.g. getStripe(), getResend()) decides
 *     whether to throw or no-op. The validator only emits warnings so
 *     ops can see which integrations are inactive on a given environment.
 *
 * This module is pure — every input comes from the `env` parameter, never
 * from `process.env` directly, so it's trivial to unit-test and safe to
 * import from anywhere without side effects.
 */

export type EnvSeverity = "error" | "warning";

export interface EnvIssue {
  /** ENV_VAR_NAME or a category like "supabase" / "stripe". */
  key: string;
  severity: EnvSeverity;
  /** Human-readable, suitable for logs and the health endpoint. */
  message: string;
}

export interface EnvValidationResult {
  ok: boolean;
  /** True when the environment is production-shaped (NODE_ENV=production). */
  isProduction: boolean;
  errors: EnvIssue[];
  warnings: EnvIssue[];
}

type RawEnv = Record<string, string | undefined>;

/**
 * Helper: returns true when the key is present and non-empty.
 * Empty strings count as missing — same intent as `.env.example` placeholders
 * being commented blank.
 */
function present(env: RawEnv, key: string): boolean {
  const v = env[key];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Validate the runtime environment. Pure: pass in a copy of process.env (or
 * any other source); returns a structured report. Never throws.
 */
export function validateEnv(env: RawEnv): EnvValidationResult {
  const errors: EnvIssue[] = [];
  const warnings: EnvIssue[] = [];

  const nodeEnv = env.NODE_ENV ?? "development";
  const isProduction = nodeEnv === "production";

  // ── Always required ──────────────────────────────────────────────────
  if (!present(env, "DATABASE_URL")) {
    errors.push({
      key: "DATABASE_URL",
      severity: "error",
      message: "DATABASE_URL is required (Postgres connection string).",
    });
  }

  // ── Production-required ──────────────────────────────────────────────
  // NEXT_PUBLIC_APP_URL is read by Stripe checkout success/cancel URLs and
  // alert email link composition. The fallback to localhost:3000 is fine
  // in dev but a silent prod break, so flag it loudly in production.
  if (!present(env, "NEXT_PUBLIC_APP_URL")) {
    issue({
      key: "NEXT_PUBLIC_APP_URL",
      productionRequired: true,
      isProduction,
      message:
        "NEXT_PUBLIC_APP_URL is required in production (Stripe redirect URLs and email links " +
        "default to http://localhost:3000 when unset).",
    }, errors, warnings);
  } else if (isProduction) {
    // Defensive: the fallback in the codebase is literal localhost — refuse
    // it explicitly in production so a copy-pasted dev value doesn't slip
    // through to prod.
    const url = env.NEXT_PUBLIC_APP_URL!;
    if (url.includes("localhost") || url.includes("127.0.0.1")) {
      errors.push({
        key: "NEXT_PUBLIC_APP_URL",
        severity: "error",
        message: `NEXT_PUBLIC_APP_URL points at ${url} in production — looks like a dev value.`,
      });
    }
    if (!/^https?:\/\//.test(url)) {
      errors.push({
        key: "NEXT_PUBLIC_APP_URL",
        severity: "error",
        message: `NEXT_PUBLIC_APP_URL must start with http:// or https:// (got "${url}").`,
      });
    }
  }

  // AUTH_MODE: must be explicit in production. Mirrors the auth.ts
  // fail-closed principle — if not explicitly set, the app silently
  // authenticates every visitor as dev-user, which is a catastrophic
  // misconfiguration. Accepting "mock" in production is allowed but only
  // if deliberate (set the var to the literal string).
  const authMode = env.AUTH_MODE;
  if (isProduction && (authMode == null || authMode.trim().length === 0)) {
    errors.push({
      key: "AUTH_MODE",
      severity: "error",
      message:
        "AUTH_MODE must be explicitly set in production (expected 'supabase' for real auth, " +
        "or 'mock' if deliberately running in mock mode).",
    });
  } else if (authMode != null && authMode !== "supabase" && authMode !== "mock") {
    errors.push({
      key: "AUTH_MODE",
      severity: "error",
      message: `AUTH_MODE must be 'supabase' or 'mock' (got "${authMode}").`,
    });
  }

  // Supabase keys are required when AUTH_MODE=supabase, regardless of NODE_ENV.
  // (Dev-with-real-Supabase is a supported configuration.)
  if (authMode === "supabase") {
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      if (!present(env, key)) {
        errors.push({
          key,
          severity: "error",
          message: `${key} is required when AUTH_MODE=supabase.`,
        });
      }
    }
  }

  // ── Feature-critical: warn only ─────────────────────────────────────
  // Each of these is read by a specific subsystem whose own client gates
  // on the key. Missing → that subsystem is inert. We surface warnings so
  // an operator can see which integrations are off on this environment.
  const featureGroups: Array<{ feature: string; keys: string[] }> = [
    {
      feature: "stripe",
      keys: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
    },
    { feature: "resend (email)", keys: ["RESEND_API_KEY"] },
    { feature: "novu (notifications)", keys: ["NOVU_API_KEY", "NEXT_PUBLIC_NOVU_APP_IDENTIFIER"] },
    { feature: "anthropic (AI)", keys: ["ANTHROPIC_API_KEY"] },
    { feature: "ebay (price sync)", keys: ["EBAY_APP_ID", "EBAY_CERT_ID"] },
    { feature: "pricecharting (price sync)", keys: ["PRICECHARTING_API_TOKEN"] },
    { feature: "cron jobs", keys: ["CRON_TOKEN"] },
  ];

  for (const group of featureGroups) {
    const missing = group.keys.filter((k) => !present(env, k));
    if (missing.length === group.keys.length) {
      warnings.push({
        key: group.feature,
        severity: "warning",
        message: `${group.feature}: not configured (all ${group.keys.length} env vars unset). Feature will be inert.`,
      });
    } else if (missing.length > 0) {
      warnings.push({
        key: group.feature,
        severity: "warning",
        message: `${group.feature}: partially configured — missing ${missing.join(", ")}.`,
      });
    }
  }

  // Wonders platform integration is a soft dependency in this model — we
  // can run the marketplace without it once data is pre-synced — but flag
  // the default localhost values in production so they're not pointing at
  // nothing.
  for (const key of ["WONDERS_PLATFORM_API_URL", "WONDERS_PLATFORM_IMAGE_BASE_URL"]) {
    const v = env[key];
    if (isProduction && v && (v.includes("localhost") || v.includes("127.0.0.1"))) {
      warnings.push({
        key,
        severity: "warning",
        message: `${key} points at ${v} in production — looks like a dev value.`,
      });
    }
  }

  return {
    ok: errors.length === 0,
    isProduction,
    errors,
    warnings,
  };
}

function issue(
  args: { key: string; message: string; productionRequired: boolean; isProduction: boolean },
  errors: EnvIssue[],
  warnings: EnvIssue[],
): void {
  if (args.productionRequired && args.isProduction) {
    errors.push({ key: args.key, severity: "error", message: args.message });
  } else {
    warnings.push({ key: args.key, severity: "warning", message: args.message });
  }
}

/**
 * Validate the live environment and either:
 *   - throw a single aggregated Error in production (so the process refuses
 *     to come up healthy), or
 *   - log warnings and continue in dev/test (loud enough to catch, lax
 *     enough not to block local iteration).
 *
 * Returns the result so callers (e.g. the health endpoint) can re-use it
 * without re-running validation.
 */
export function assertEnv(env: RawEnv = process.env): EnvValidationResult {
  const result = validateEnv(env);

  for (const w of result.warnings) {
    console.warn(`[env] WARN ${w.key}: ${w.message}`);
  }

  if (!result.ok && result.isProduction) {
    const summary = result.errors.map((e) => `- ${e.key}: ${e.message}`).join("\n");
    throw new Error(
      `Refusing to start: ${result.errors.length} required env var(s) are missing or invalid:\n${summary}`,
    );
  }

  for (const e of result.errors) {
    // Errors in non-production: still loud, but only logged.
    console.error(`[env] ERROR ${e.key}: ${e.message}`);
  }

  return result;
}
