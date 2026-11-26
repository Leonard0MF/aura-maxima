"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { LangSwitch } from "@/components/LangSwitch";
import type { Locale } from "@/i18n/routing";

type Item = { n: string; label: string; href: string };

/*
 * Celular / tablet em pé (< 768px): o cabeçalho do hero mostra só o nome e o
 * botão "Menu", que abre um overlay com a navegação numerada e PT · EN · ES.
 * Dialog acessível: foco preso, Esc / X / escolher um link fecham, o foco
 * volta para o botão, a página não rola por baixo. Sem JS, o botão nem
 * aparece (a navegação continua acessível pelo rodapé de cada seção e pelo
 * seletor de idioma do desktop).
 */
export function MobileMenu({
  items,
  locale,
  labels,
  langNames,
}: {
  items: Item[];
  locale: Locale;
  labels: { menu: string; close: string; nav: string; lang: string };
  langNames: Record<Locale, string>;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = panel.current!;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    el.querySelector<HTMLElement>("button, a[href]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "Tab") {
        const f = [...el.querySelectorAll<HTMLElement>("button, a[href]")];
        const first = f[0],
          last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const b = btn.current;
    return () => {
      document.documentElement.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      b?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="menu-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {labels.menu}
      </button>
      {open &&
        /* portal no body: o .hero tem container-type (vira o bloco de contenção do position: fixed) */
        createPortal(
          <div
            ref={panel}
            className="menu-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={labels.menu}
          >
            <div className="menu-overlay__top">
              <span className="text-ink-soft">{labels.nav}</span>
              <button
                type="button"
                className="menu-btn"
                onClick={() => setOpen(false)}
              >
                {labels.close} <span aria-hidden="true">×</span>
              </button>
            </div>
            <nav aria-label={labels.nav}>
              <ol className="menu-overlay__nav">
                {items.map((i) => (
                  <li key={i.n}>
                    <a href={i.href} onClick={() => setOpen(false)}>
                      <span className="menu-overlay__n">{i.n}</span>
                      <span className="font-display">{i.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <LangSwitch
              locale={locale}
              path="/"
              label={labels.lang}
              names={langNames}
              className="menu-overlay__lang"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
