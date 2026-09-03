import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Gonka key is server-only. Nothing here may expose it to the client bundle.
  env: {},
  experimental: {
    // Verification runs are long-lived SSE streams; keep them alive.
    proxyTimeout: 180_000,
  },
};

export default nextConfig;
