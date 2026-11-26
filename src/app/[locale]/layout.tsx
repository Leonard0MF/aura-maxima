import type { Metadata, Viewport } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SITE_URL, profile } from "@/content/profile";
import { htmlLang, ogLocale, routing } from "@/i18n/routing";
import { alternates } from "@/i18n/seo";

import { display, mono, sans } from "../fonts";
import "../globals.css";

/* layout raiz por idioma: /, /en e /es são gerados no build (SSG) */
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  const title = `${profile.name} · ${t("role")}`;
  const description = t("tagline");
  const alt = alternates(locale);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: title, template: `%s · ${profile.name}` },
    description,
    applicationName: profile.name,
    authors: [{ name: profile.fullName, url: profile.contact.github }],
    creator: profile.fullName,
    keywords: t.raw("keywords") as string[],
    alternates: alt,
    openGraph: {
      type: "website",
      locale: ogLocale[locale],
      alternateLocale: routing.locales.filter((l) => l !== locale).map((l) => ogLocale[l]),
      url: alt.canonical,
      siteName: profile.name,
      title,
      description,
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  /* ocupa a tela inteira (notch); as margens usam env(safe-area-inset-*) */
  viewportFit: "cover",
  colorScheme: "dark",
};

/*
 * Roda antes da primeira pintura:
 *  - pula a animação do scan em visitas repetidas na sessão ou com reduced-motion;
 *  - usa a imagem estática do objeto 3D com reduced-motion ou CPU fraca (≤ 4 núcleos);
 *  - liga a transição do AUDIT (data-pin: "css" com scroll-driven animations,
 *    "js" sem suporte); com reduced-motion fica o fade simples.
 * Storage pode lançar exceção (aba privada, bloqueio): tudo em try/catch.
 */
const boot = `(function(){var d=document.documentElement;d.dataset.js="1";try{if(sessionStorage.getItem("recon:scan-seen")||matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.scan="instant"}catch(e){}try{if(matchMedia("(prefers-reduced-motion: reduce)").matches||(navigator.hardwareConcurrency||8)<=4)d.dataset.fx="static";else if(!sessionStorage.getItem("recon:intro"))d.dataset.intro="1"}catch(e){}try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.pin=CSS.supports("animation-timeline: view()")?"css":"js"}catch(e){}})()`;

export default async function LocaleLayout({ children, params }: Readonly<{ children: React.ReactNode }> & Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("meta");

  return (
    <html lang={htmlLang[locale]} className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className="text-fg">
        <a
          href="#conteudo"
          className="sr-only z-40 rounded-md bg-accent px-4 py-2 font-mono text-sm text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t("skip")}
        </a>
        {children}
      </body>
    </html>
  );
}
