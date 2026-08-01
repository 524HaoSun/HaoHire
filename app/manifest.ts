import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "HaoHire",
    short_name: "HaoHire",
    description: "Import jobs, track applications, and stay ahead of deadlines.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fcf8ef",
    theme_color: "#f04412",
    orientation: "portrait",
    icons: [
      { src: "/icon-snoopy-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-snoopy-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}