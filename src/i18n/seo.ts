import { htmlLang, localePath, routing } from "./routing";

/* canonical + hreflang de uma página (mesmo caminho nos 3 idiomas) */
export function alternates(locale: (typeof routing.locales)[number], path = "/") {
  return {
    canonical: localePath(locale, path),
    languages: {
      ...Object.fromEntries(routing.locales.map((l) => [htmlLang[l], localePath(l, path)])),
      "x-default": localePath(routing.defaultLocale, path),
    },
  };
}
