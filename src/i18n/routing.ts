import { defineRouting } from "next-intl/routing";

/*
 * pt-BR é o padrão e fica sem prefixo (/); en e es em /en e /es.
 * A detecção de idioma e o cookie são feitos à mão em src/proxy.ts
 * (só na primeira visita; a escolha manual vence), por isso ficam
 * desligados aqui. hreflang vem do metadata (HTML estático), não do header.
 */
export const routing = defineRouting({
  locales: ["pt", "en", "es"],
  defaultLocale: "pt",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
});

export type Locale = (typeof routing.locales)[number];

/** cookie com o idioma escolhido (ou detectado na 1ª visita) */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** valor do atributo lang (e do hreflang) */
export const htmlLang: Record<Locale, string> = { pt: "pt-BR", en: "en", es: "es" };

/** og:locale */
export const ogLocale: Record<Locale, string> = { pt: "pt_BR", en: "en_US", es: "es_ES" };

/** caminho no idioma: localePath("en", "/projetos/aegis") → "/en/projetos/aegis" */
export function localePath(locale: Locale, path = "/") {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}
