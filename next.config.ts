import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Gonka key is server-only. Nothing here may expose it to the client bundle.
  env: {},

  // The dev-mode route badge sits bottom-left, on top of the page rather than
  // beside it, and it lands mid-word in the first probe card at 1536px. That is
  // invisible in production and highly visible in every screenshot, every QA
  // capture and every take of the pitch video — all of which are recorded
  // against `next dev`. Turning it off costs nothing: compile and runtime errors
  // are still surfaced.
  devIndicators: false,
};

export default nextConfig;
