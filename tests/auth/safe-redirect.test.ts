import { describe, it, expect } from "vitest";
import { resolveSafeNext } from "@/lib/auth/safe-redirect";

describe("resolveSafeNext", () => {
  it("returns '/' for null / empty / undefined", () => {
    expect(resolveSafeNext(null)).toBe("/");
    expect(resolveSafeNext(undefined)).toBe("/");
    expect(resolveSafeNext("")).toBe("/");
  });

  it("accepts same-origin relative paths", () => {
    expect(resolveSafeNext("/")).toBe("/");
    expect(resolveSafeNext("/dashboard")).toBe("/dashboard");
    expect(resolveSafeNext("/card/abc123?treatment=foil")).toBe("/card/abc123?treatment=foil");
  });

  it("rejects absolute external URLs", () => {
    expect(resolveSafeNext("https://evil.com/login")).toBe("/");
    expect(resolveSafeNext("http://evil.com")).toBe("/");
    expect(resolveSafeNext("javascript:alert(1)")).toBe("/");
    expect(resolveSafeNext("data:text/html,<script>")).toBe("/");
  });

  it("rejects protocol-relative URLs (//evil.com)", () => {
    expect(resolveSafeNext("//evil.com")).toBe("/");
    expect(resolveSafeNext("//evil.com/login")).toBe("/");
  });

  it("rejects backslash bypass attempts", () => {
    // Some browsers normalise \ to / and treat /\evil.com as protocol-relative.
    expect(resolveSafeNext("/\\evil.com")).toBe("/");
    expect(resolveSafeNext("\\evil.com")).toBe("/");
  });

  it("rejects paths that don't start with /", () => {
    expect(resolveSafeNext("dashboard")).toBe("/");
    expect(resolveSafeNext("./dashboard")).toBe("/");
    expect(resolveSafeNext("../dashboard")).toBe("/");
  });
});
