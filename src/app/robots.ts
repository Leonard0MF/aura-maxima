import type { MetadataRoute } from "next";

import { SITE_URL } from "@/content/profile";
import { localePath, routing } from "@/i18n/routing";

/* CTF · flag 3 de 3 está no caminho "proibido" abaixo (em cada idioma). */
export default function robots(): MetadataRoute.Robots {
  const hidden = routing.locales.flatMap((l) => [`${localePath(l, "/recon-archive")}/`, localePath(l, "/flag")]);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: hidden }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
