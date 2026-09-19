import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    // Only bundle the Phosphor icons that are actually imported.
    optimizePackageImports: ['@phosphor-icons/react'],
  },
};

export default nextConfig;
