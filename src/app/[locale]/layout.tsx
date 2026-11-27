import type { Metadata, Viewport } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { DiagMount } from "@/components/DiagMount";
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
    authors: [{ name: profile.fullName, url: profile.contact.linkedin }],
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
 *  - usa a imagem estática do hero só com reduced-motion (nunca pelo número
 *    de núcleos: o Safari do iPhone informa 4 mesmo em aparelhos potentes;
 *    a qualidade de cada seção sai da medição de fps);
 *  - liga a entrada do AUDIT (data-reveal: círculo de ~900 ms); com
 *    reduced-motion fica o fade simples.
 * Storage pode lançar exceção (aba privada, bloqueio): cada leitura em
 * try/catch; sem storage, só repete o scan/intro na próxima visita.
 */
const boot = `(function(){var d=document.documentElement;d.dataset.js="1";var ss=function(k){try{return sessionStorage.getItem(k)}catch(e){return null}};var rm=false;try{rm=matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){}if(ss("recon:scan-seen")||rm)d.dataset.scan="instant";try{var q=location.search,f=/[?&]intro=1/.test(q),w="";if(rm&&!f)d.dataset.fx="static";if(/[?&]intro=0/.test(q))w="param";else if(!f&&rm)w="reduced-motion";else if(!f&&ss("recon:intro"))w="session";if(w)d.dataset.introWhy=w;else{d.dataset.intro="pending";d.dataset.introAt=Math.round(performance.now());if(f)d.dataset.introForce="";var s=function(){if(d.dataset.intro==="pending"){d.dataset.intro="done";d.dataset.introWhy="input"}};["pointerdown","keydown","wheel","touchstart","scroll"].forEach(function(n){addEventListener(n,s,{once:true,passive:true})})}}catch(e){d.dataset.introWhy="error"}if(!rm)d.dataset.reveal="1"})()`;

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
        <DiagMount />
      </body>
    </html>
  );
}
