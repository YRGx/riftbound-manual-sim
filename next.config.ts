import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cmsassets.rgpub.io",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "static.riftcodex.com",
        pathname: "**",
      },
      {
        protocol: "https",
        hostname: "media.riftcodex.com",
        pathname: "**",
      },
    ],
  },
};

export default nextConfig;
