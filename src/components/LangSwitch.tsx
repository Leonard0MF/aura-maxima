"use client";

import type { MouseEvent } from "react";

import { LOCALE_COOKIE, htmlLang, localePath, routing, type Locale } from "@/i18n/routing";

/*
 * Seletor PT · EN · ES. Links comuns (funcionam sem JS); com JS, o clique
 * grava a escolha no cookie (vence a detecção da primeira visita) e leva a
 * seção que está na tela como âncora, para cair no mesmo ponto da página.
 * Navegação completa de propósito: o proxy decide o idioma pelo cookie e um
 * prefetch antigo do roteador poderia trazer o idioma anterior.
 */
function switchTo(e: MouseEvent<HTMLAnchorElement>, to: Locale, path: string) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  document.cookie = `${LOCALE_COOKIE}=${to}; path=/; max-age=31536000; samesite=lax`;
  const mid = innerHeight / 2;
  const here = [...document.querySelectorAll<HTMLElement>("main section[id]")].find((s) => {
    const r = s.getBoundingClientRect();
    return r.top <= mid && r.bottom > mid;
  });
  const hash = here && here.id !== "hero" ? `#${here.id}` : location.hash;
  location.assign(localePath(to, path) + hash);
}

export function LangSwitch({ locale, path, label, names, className = "" }: { locale: Locale; path: string; label: string; names: Record<Locale, string>; className?: string }) {
  return (
    <nav aria-label={label} className={`flex items-center gap-1.5 ${className}`}>
      {routing.locales.map((l, i) => (
        <span key={l} className="flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden="true" className="opacity-50">
              ·
            </span>
          )}
          {l === locale ? (
            <span aria-current="true" lang={htmlLang[l]} className="text-accent-ink underline decoration-1 underline-offset-4">
              <span aria-hidden="true">{l.toUpperCase()}</span>
              <span className="sr-only">{names[l]}</span>
            </span>
          ) : (
            <a href={localePath(l, path)} hrefLang={htmlLang[l]} lang={htmlLang[l]} onClick={(e) => switchTo(e, l, path)} className="opacity-70 hover:text-accent-ink hover:opacity-100">
              <span aria-hidden="true">{l.toUpperCase()}</span>
              <span className="sr-only">{names[l]}</span>
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}
