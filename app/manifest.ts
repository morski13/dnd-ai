// Lets phones add the app to the home screen with its own icon and dark splash.
import type { MetadataRoute } from "next";
import { APP_NAME, APP_SHORT_NAME, APP_TAGLINE } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_TAGLINE,
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#15130F",
    theme_color: "#15130F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
