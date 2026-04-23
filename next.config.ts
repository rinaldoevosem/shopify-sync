import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors https://steindiamonds.myshopify.com https://admin.shopify.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
