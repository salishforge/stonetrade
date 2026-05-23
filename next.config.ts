import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: ".",
  },
  // Next.js 16 blocks cross-origin dev-resource requests (HMR, RSC payloads,
  // etc.) by default. We access dev over Tailscale (100.97.161.7) and the
  // server's public IPv4 — without allowing them, hydration silently fails
  // and client forms revert to native browser submission. Localhost is
  // always allowed implicitly; we only need to list the alternate hosts.
  allowedDevOrigins: ["100.97.161.7", "15.204.91.70"],
};

export default nextConfig;
