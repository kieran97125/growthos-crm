import type { MetadataRoute } from "next";
import { BRAND, brandIconPath } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: BRAND.colors.canvas,
    theme_color: BRAND.colors.accent,
    lang: "zh-HK",
    icons: [
      {
        src: brandIconPath(192),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: brandIconPath(512),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: brandIconPath(512),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
