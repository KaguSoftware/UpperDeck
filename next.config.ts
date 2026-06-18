import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  images: {
    qualities: [75, 90],
    minimumCacheTTL: 2592000, // 30 days — floor for /_next/image cache-control (Supabase objects send no TTL)
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
