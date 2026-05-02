import { serve } from "@novu/framework/next";
import { workflows } from "@/lib/notify/workflows";

/**
 * Bridge endpoint for Novu's code-first SDK. Novu Cloud calls this URL to
 * discover registered workflows (`GET`) and to execute step resolvers
 * during a triggered run (`POST`/`OPTIONS`). The handler authenticates
 * incoming calls via NOVU_SECRET_KEY (HMAC) — see @novu/framework docs.
 *
 * After deploying, run the sync command from docs/novu-setup.md so the
 * dashboard picks up local workflow changes:
 *
 *   npx novu sync --bridge-url https://<host>/api/novu \
 *                 --secret-key $NOVU_API_KEY
 *
 * Lazy construction note: `serve({ workflows })` instantiates a Novu Client
 * synchronously and reads NOVU_SECRET_KEY at construction time. Doing that
 * at module load breaks `next build`'s page-data-collection step in any
 * environment without the secret (CI, fresh checkouts). We defer the call
 * until the first request — at which point the running server has the real
 * env var available. Behavior at runtime is identical; only the timing of
 * the constructor call moves.
 */
type NovuHandlers = ReturnType<typeof serve>;
let _handlers: NovuHandlers | null = null;
function handlers(): NovuHandlers {
  if (!_handlers) _handlers = serve({ workflows });
  return _handlers;
}

export const GET: NovuHandlers["GET"] = (req, ctx) => handlers().GET(req, ctx);
export const POST: NovuHandlers["POST"] = (req, ctx) => handlers().POST(req, ctx);
export const OPTIONS: NovuHandlers["OPTIONS"] = (req, ctx) => handlers().OPTIONS(req, ctx);

// The framework's serve() handler uses Node-only APIs (crypto, etc.) and is
// not compatible with the Edge runtime. Pin Node so a future global edge
// migration doesn't accidentally break the bridge.
export const runtime = "nodejs";
