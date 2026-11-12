import type { MetadataRoute } from "next";

/** Lets phones, tablets and computers install School Wars as an app (it's still the same website). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "School Wars",
    short_name: "School Wars",
    description: "Lemons vs Orange Peels: a school throwing battle. Invite your friends with a code.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#0b0d12",
    theme_color: "#0b0d12",
    categories: ["games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
