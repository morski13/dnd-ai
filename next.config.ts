import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Hide the little "N" badge in development: it sits on top of the Home button.
  // Errors still show up on screen.
  devIndicators: false,
  partialPrefetching: true,
  experimental: {
    // Client cache: a screen you opened in the last 30 seconds opens again instantly
    // (no wait for the server). Anything you change clears it at once (refresh() in the actions),
    // and Session mode refreshes itself every few seconds anyway.
    staleTimes: { dynamic: 30, static: 300 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
