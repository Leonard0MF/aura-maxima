/*
 * i18n mínimo. Hoje só existe pt-BR, mas todo texto do conteúdo é um
 * `Localized` para que um "en" possa ser adicionado depois sem mudar a
 * forma dos dados: basta ampliar `Locale` e preencher as chaves.
 */
export type Locale = "pt";

export const defaultLocale: Locale = "pt";

export type Localized = Record<Locale, string>;

export function t(value: Localized, locale: Locale = defaultLocale): string {
  return value[locale];
}
