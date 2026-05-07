import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/overview", destination: "/docs/overview", permanent: true },
      { source: "/docs", destination: "/docs/overview", permanent: true },
    ];
  },
};

export default nextConfig;
