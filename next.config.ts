import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Gonka key is server-only. Nothing here may expose it to the client bundle.
  env: {},
};

export default nextConfig;
