// SHA-256 of a canonicalised contract body.
//
// We use Node's `crypto` rather than Web Crypto because every read path
// runs server-side and crypto is already a stable Node dep. The output is
// hex (64 chars) for easy storage + comparison.

import { createHash } from "node:crypto";
import { canonicalize } from "./canonicalize";

export function hashBody(body: unknown): string {
  const canon = canonicalize(body);
  return createHash("sha256").update(canon, "utf8").digest("hex");
}
