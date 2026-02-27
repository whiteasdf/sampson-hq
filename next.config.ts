import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/worker/clients", destination: "/worker", permanent: true },
      { source: "/worker/clients/:path*", destination: "/worker", permanent: true },
    ];
  },
};

export default nextConfig;
