import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // sql.js (ASM) is pure JS — keep external so standalone tracing includes it.
  serverExternalPackages: ["sql.js"],
  async rewrites() {
    // Public ST/OpenAI-compatible paths without the /api prefix.
    return [
      { source: "/healthz", destination: "/api/healthz" },
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
};

export default nextConfig;
