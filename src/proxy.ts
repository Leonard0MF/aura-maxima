import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_COOKIE, localePath, routing, type Locale } from "./i18n/routing";

const intl = createMiddleware(routing);
const YEAR = 60 * 60 * 24 * 365;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|lighthouse|headless/i;

const isLocale = (v: string | undefined): v is Locale => !!v && (routing.locales as readonly string[]).includes(v);

/* idioma preferido do Accept-Language (respeita os pesos q) entre pt/en/es */
function detect(header: string | null): Locale {
  const ranked = (header ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...rest] = part.trim().toLowerCase().split(";");
      const q = rest.find((p) => p.trim().startsWith("q="));
      return { lang: tag.split("-")[0], q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((x) => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q);
  return ranked.find((x) => isLocale(x.lang))?.lang as Locale | undefined ?? routing.defaultLocale;
}

/*
 * Idioma:
 * - URL com prefixo (/en, /es): a URL manda.
 * - URL sem prefixo (pt) e cookie NEXT_LOCALE presente: o cookie manda
 *   (escolha manual no seletor ou a detecção da primeira visita).
 * - sem cookie (primeira visita): detecta pelo Accept-Language, grava o
 *   cookie e, se for en/es, redireciona. Robôs não são redirecionados (o
 *   Google indexa cada versão pelo hreflang).
 * As páginas continuam estáticas: isto só decide QUAL página estática servir.
 */
export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const first = pathname.split("/")[1];
  if (isLocale(first) && first !== routing.defaultLocale) return intl(req);
  /* imagens de metadata (OG) seguem a URL pedida, sem detecção */
  if (pathname.includes("/opengraph-image")) return intl(req);

  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  let target: Locale;
  let remember = false;
  if (isLocale(saved)) target = saved;
  else if (BOT.test(req.headers.get("user-agent") ?? "")) return intl(req);
  else {
    target = detect(req.headers.get("accept-language"));
    remember = true;
  }

  const res =
    target === routing.defaultLocale || first === routing.defaultLocale
      ? intl(req)
      : NextResponse.redirect(new URL(localePath(target, pathname) + search, req.url));
  if (remember) res.cookies.set(LOCALE_COOKIE, target, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return res;
}

export const config = {
  /* tudo menos arquivos (com ponto), _next e _vercel */
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
