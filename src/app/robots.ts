import type { MetadataRoute } from "next";

import { SITE_URL } from "@/content/profile";

/* CTF · flag 3 de 3 está no caminho "proibido" abaixo. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/recon-archive/", "/flag"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
