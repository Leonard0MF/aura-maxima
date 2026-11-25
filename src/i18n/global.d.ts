import type { routing } from "./routing";

/* Locale tipado; as chaves das mensagens são conferidas por scripts/check-i18n.mjs */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
  }
}
