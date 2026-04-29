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
 */
export const { GET, POST, OPTIONS } = serve({ workflows });

// The framework's serve() handler uses Node-only APIs (crypto, etc.) and is
// not compatible with the Edge runtime. Pin Node so a future global edge
// migration doesn't accidentally break the bridge.
export const runtime = "nodejs";
