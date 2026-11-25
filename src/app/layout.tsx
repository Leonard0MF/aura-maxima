import type { Metadata, Viewport } from "next";

import { SITE_URL, profile } from "@/content/profile";
import { t } from "@/lib/i18n";

import { display, mono, sans } from "./fonts";
import "./globals.css";

const title = `${profile.name} · ${t(profile.role)}`;
const description = t(profile.tagline);

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: `%s · ${profile.name}` },
  description,
  applicationName: profile.name,
  authors: [{ name: profile.fullName, url: profile.contact.github }],
  creator: profile.fullName,
  keywords: ["desenvolvedor full-stack", "segurança", "pentest", "Next.js", "React", "TypeScript", "portfólio"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: profile.name,
    title,
    description,
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  colorScheme: "dark",
};

/*
 * Roda antes da primeira pintura:
 *  - pula a animação do scan em visitas repetidas na sessão ou com reduced-motion;
 *  - usa a imagem estática do objeto 3D com reduced-motion ou CPU fraca (≤ 4 núcleos).
 * Storage pode lançar exceção (aba privada, bloqueio): tudo em try/catch.
 */
const boot = `(function(){var d=document.documentElement;d.dataset.js="1";try{if(sessionStorage.getItem("recon:scan-seen")||matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.scan="instant"}catch(e){}try{if(matchMedia("(prefers-reduced-motion: reduce)").matches||(navigator.hardwareConcurrency||8)<=4)d.dataset.fx="static";else if(!sessionStorage.getItem("recon:intro"))d.dataset.intro="1"}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className="text-fg">
        <a
          href="#conteudo"
          className="sr-only z-40 rounded-md bg-accent px-4 py-2 font-mono text-sm text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
