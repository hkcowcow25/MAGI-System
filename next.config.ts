import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Public ST/OpenAI-compatible paths without the /api prefix.
    return [
      { source: "/healthz", destination: "/api/healthz" },
      { source: "/v1/:path*", destination: "/api/v1/:path*" },
    ];
  },
};

export default nextConfig;
