import type { Metadata, Viewport } from "next";

import { SITE_URL, profile } from "@/content/profile";
import { t } from "@/lib/i18n";

import { mono, sans } from "./fonts";
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
 *  - aplica o modo salvo (terminal/clean);
 *  - pula a animação do scan em visitas repetidas na sessão ou com reduced-motion.
 * Storage pode lançar exceção (aba privada, bloqueio): tudo em try/catch.
 */
const boot = `(function(){var d=document.documentElement;d.dataset.js="1";try{if(localStorage.getItem("recon:mode")==="clean")d.dataset.mode="clean"}catch(e){}try{if(sessionStorage.getItem("recon:scan-seen")||matchMedia("(prefers-reduced-motion: reduce)").matches)d.dataset.scan="instant"}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" data-mode="terminal" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body className="text-fg">
        <a
          href="#conteudo"
          className="sr-only z-40 rounded-md bg-accent px-4 py-2 font-mono text-sm text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
