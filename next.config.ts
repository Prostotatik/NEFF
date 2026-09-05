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

  // `runs-seed/` is read at runtime with `readdir`, which the file tracer cannot
  // see — without this the seeded history ships in the repo and is missing from
  // the deployment, so a fresh instance shows an empty landing page and 404s
  // every seeded permalink. Named per route rather than globally so nothing else
  // drags the directory into a bundle that has no use for it.
  outputFileTracingIncludes: {
    "/r/[id]": ["./runs-seed/**"],
    "/api/history": ["./runs-seed/**"],
  },
};

export default nextConfig;
