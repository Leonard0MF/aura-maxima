import type { Metadata } from "next";

import { NotFoundView } from "@/components/NotFoundView";
import { htmlLang, localePath, routing } from "@/i18n/routing";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import pt from "../../messages/pt.json";
import { display, mono, sans } from "./fonts";
import "./globals.css";

/*
 * 404 de URLs que não casam com nenhuma rota. Não passa pelo layout por
 * idioma, então traz os três textos no HTML estático; o script inline mostra
 * o do prefixo da URL (/en, /es) e ajusta o lang. Sem JS: português.
 */
const messages = { pt, en, es };

export const metadata: Metadata = { title: "404", robots: { index: false, follow: false } };

const pick = `(function(){var l=location.pathname.split("/")[1];var m=${JSON.stringify(htmlLang)};if(l==="en"||l==="es"){document.documentElement.lang=m[l];document.querySelectorAll("[data-nf]").forEach(function(e){e.hidden=e.getAttribute("data-nf")!==l})}})()`;

export default function GlobalNotFound() {
  return (
    <html lang={htmlLang.pt} className={`${sans.variable} ${mono.variable} ${display.variable}`}>
      <body className="text-fg">
        {routing.locales.map((l) => (
          <div key={l} data-nf={l} hidden={l !== routing.defaultLocale}>
            <NotFoundView {...messages[l].notFound} home={localePath(l)} />
          </div>
        ))}
        <script dangerouslySetInnerHTML={{ __html: pick }} />
      </body>
    </html>
  );
}
