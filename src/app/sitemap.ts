import type { MetadataRoute } from "next";

import { SITE_URL, projects } from "@/content/profile";
import { htmlLang, localePath, routing } from "@/i18n/routing";

/* cada página nos 3 idiomas, com os alternates (hreflang) de cada uma */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [{ path: "/", priority: 1 }, ...projects.map((p) => ({ path: `/projetos/${p.slug}`, priority: 0.8 }))];
  const abs = (l: (typeof routing.locales)[number], path: string) => `${SITE_URL}${localePath(l, path) === "/" ? "" : localePath(l, path)}`;
  return pages.flatMap(({ path, priority }) =>
    routing.locales.map((l) => ({
      url: abs(l, path),
      changeFrequency: "monthly" as const,
      priority,
      alternates: { languages: { ...Object.fromEntries(routing.locales.map((o) => [htmlLang[o], abs(o, path)])), "x-default": abs(routing.defaultLocale, path) } },
    })),
  );
}
