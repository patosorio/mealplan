import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces a self-contained Node.js server in .next/standalone/
  // Required for deployment to Cloud Run (not compatible with static export).
  output: "standalone",
};

export default nextConfig;
