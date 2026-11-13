import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulse — Garmin Training Dashboard",
    short_name: "Pulse",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0d0f",
    theme_color: "#0c0d0f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
