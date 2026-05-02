import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  safeFetch,
  FetchTimeoutError,
  FetchSizeLimitError,
} from "@/lib/http/safe-fetch";

const realFetch = globalThis.fetch;

beforeEach(() => {
  // Each test installs its own fake fetch; restore between tests.
  globalThis.fetch = realFetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

describe("safeFetch", () => {
  it("passes through normal responses", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("hello", { status: 200 }));

    const res = await safeFetch("https://example.test/foo");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });

  it("rejects responses whose Content-Length exceeds maxBytes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("body", {
        status: 200,
        headers: { "content-length": "999999" },
      }),
    );

    await expect(safeFetch("https://example.test/big", { maxBytes: 100 })).rejects.toThrow(
      FetchSizeLimitError,
    );
  });

  it("aborts mid-stream when body exceeds maxBytes (no Content-Length)", async () => {
    // Stream a 200-byte body but cap at 50.
    const big = new Uint8Array(200);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(big);
        controller.close();
      },
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(stream, { status: 200 }));

    await expect(safeFetch("https://example.test/streamed", { maxBytes: 50 })).rejects.toThrow(
      FetchSizeLimitError,
    );
  });

  it("throws FetchTimeoutError when fetch never resolves", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, init?: RequestInit) => {
      // Resolve when (and only when) the controller's signal aborts.
      return new Promise((_, reject) => {
        const sig = init?.signal;
        if (sig) {
          if (sig.aborted) {
            reject(new DOMException("aborted", "AbortError"));
          } else {
            sig.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }
        }
      });
    });

    await expect(
      safeFetch("https://example.test/slow", { timeoutMs: 30 }),
    ).rejects.toThrow(FetchTimeoutError);
  });
});
