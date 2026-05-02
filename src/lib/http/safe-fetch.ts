/**
 * Outbound HTTP wrapper with sane defaults for talking to external APIs.
 *
 * Why this exists:
 *  - A slow / hung upstream (eBay throttling, the Wonders platform paused
 *    in a debugger, Cardeio's CDN holding the connection open) will hold
 *    a Next.js request handler open until the platform-level timeout
 *    fires. Inside our own code we should give up sooner.
 *  - The default global `fetch` has no timeout, no body-size cap, and
 *    happily eats whatever the upstream sends. A hostile or compromised
 *    upstream returning a multi-GB response would exhaust our memory.
 *
 * The wrapper applies:
 *   - AbortController-based timeout (default 10s, override via `timeoutMs`)
 *   - Composes with caller-supplied AbortSignal via AbortSignal.any()
 *   - Optional response size cap (default 8 MiB; raise per call where the
 *     upstream legitimately returns more)
 *
 * Errors are deliberately distinguishable so callers can branch:
 *   - `FetchTimeoutError` → upstream took too long
 *   - `FetchSizeLimitError` → response exceeded `maxBytes`
 *   - other thrown errors → network / DNS / TLS as raised by fetch
 */

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export class FetchTimeoutError extends Error {
  constructor(public readonly url: string, public readonly timeoutMs: number) {
    super(`Outbound fetch to ${url} exceeded ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

export class FetchSizeLimitError extends Error {
  constructor(public readonly url: string, public readonly maxBytes: number) {
    super(`Outbound fetch from ${url} exceeded ${maxBytes} bytes`);
    this.name = "FetchSizeLimitError";
  }
}

export interface SafeFetchInit extends RequestInit {
  /** Hard timeout in milliseconds. Default 10s. */
  timeoutMs?: number;
  /** Response size cap in bytes. Default 8 MiB. */
  maxBytes?: number;
}

/**
 * fetch() with a timeout and a response-size cap. Returns the Response so
 * callers can keep using `.json()` / `.text()`. The size cap is enforced
 * by reading via the body stream; if the cap is hit, the fetch is aborted
 * and `FetchSizeLimitError` is thrown.
 *
 * Don't use this for legitimate large-payload endpoints (file uploads,
 * media). Lift `maxBytes` per call where appropriate.
 */
export async function safeFetch(
  input: string | URL,
  init: SafeFetchInit = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES, signal, ...rest } = init;
  const url = typeof input === "string" ? input : input.toString();

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  // Combine caller-supplied signal with our timeout signal so either can
  // abort the request. AbortSignal.any has been baseline since Node 20.
  const composed = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  let response: Response;
  try {
    response = await fetch(url, { ...rest, signal: composed });
  } catch (err) {
    if (timeoutController.signal.aborted) {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  // Enforce a response-size cap. Without this, a hostile upstream could
  // stream us a multi-GB body. The Content-Length header is checked first
  // (cheap rejection); if missing, the body is buffered through a counter
  // and the request aborted on overflow.
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new FetchSizeLimitError(url, maxBytes);
  }

  if (!response.body) return response;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      try { reader.cancel(); } catch { /* ignore */ }
      throw new FetchSizeLimitError(url, maxBytes);
    }
    chunks.push(value);
  }

  // Concat chunks into a single Uint8Array. Going via an explicit ArrayBuffer
  // (rather than passing the Uint8Array[] to new Blob) sidesteps a strict-TS
  // mismatch between Uint8Array<ArrayBufferLike> and Blob's BlobPart[].
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(merged, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
