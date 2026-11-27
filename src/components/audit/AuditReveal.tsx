"use client";

import { useEffect, useRef } from "react";

import { holeCenter } from "./layout";

/* a abertura roda UMA vez por carregamento de página (sobrevive a remontagens) */
let opened = false;

/*
 * Entrada do AUDIT: animação de TEMPO, não de rolagem (a página rola sempre).
 *
 * 1ª entrada da página: quando o topo da seção cruza ~60% da viewport, um
 * círculo de cor sólida nasce no centro do buraco negro e cresce até cobrir a
 * seção em ~900 ms. Ele é um <div> de 100 px animado SÓ com transform: scale()
 * (Web Animations API, no compositor). Durante o círculo nada mais muda: a
 * seção está com opacity 0, o loop do WebGL parado, nenhum decrypt.
 * Coberta a seção (data-done), o AuditField liga o loop do canvas já aquecido
 * e avisa ("audit:live") depois do 1º quadro desenhado; aí a seção aparece com
 * fade de 300 ms (opacity) e, terminado o fade, o título faz o decrypt.
 *
 * Entradas seguintes: nada de círculo; a seção já está visível e o canvas só
 * retoma o loop (lib/gl-slot, persist).
 *
 * Reduced-motion: sem data-reveal (script de boot), a seção aparece pronta.
 */
export function AuditReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const iris = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = ref.current!;
    const section = wrap.querySelector<HTMLElement>("section")!;
    const field = section.querySelector<HTMLElement>(".audit-field");
    const dot = iris.current!;
    const title = () => section.querySelector(".sh-title [data-decrypt]")?.dispatchEvent(new Event("decrypt"));

    if (opened || !document.documentElement.dataset.reveal) {
      section.dataset.in = "";
      section.dataset.done = "";
      section.dataset.shown = "";
      if (!opened) title();
      opened = true;
      return;
    }

    let geo = { x: 0, y: 0, r: 0 };
    const measure = () => {
      const s = section.getBoundingClientRect();
      const f = field?.getBoundingClientRect();
      let x = s.width * 0.25, y = s.height / 2;
      if (f?.width && f.height) {
        const c = holeCenter(f.width, f.height);
        x = f.left - s.left + c.x;
        y = f.top - s.top + c.y;
      }
      geo = { x, y, r: Math.hypot(Math.max(x, s.width - x), Math.max(y, s.height - y)) + 2 };
    };

    let timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    let anim: Animation | null = null;

    const show = () => {
      if ("shown" in section.dataset) return;
      section.dataset.shown = ""; // CSS: opacity 0 → 1 em 300 ms
      later(() => {
        dot.style.display = "none";
        title();
      }, 320);
    };
    const onLive = () => {
      if ("done" in section.dataset) show();
    };
    section.addEventListener("audit:live", onLive);

    const start = () => {
      opened = true;
      io.disconnect();
      measure(); // geometria lida ANTES do primeiro quadro da animação
      /* 100 px de diâmetro → escala que cobre a seção inteira */
      const end = (2 * geo.r) / 100;
      Object.assign(dot.style, { left: `${(geo.x - 50).toFixed(1)}px`, top: `${(geo.y - 50).toFixed(1)}px`, display: "block" });
      section.dataset.in = "";
      anim = dot.animate([{ transform: "scale(0.02)" }, { transform: `scale(${end.toFixed(3)})` }], {
        duration: 900,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      });
      void anim.finished.then(
        () => {
          section.dataset.done = ""; // AuditField: liga o loop → "audit:live"
          later(show, 400); // sem canvas (estático/sem WebGL): aparece assim mesmo
        },
        () => {},
      );
    };

    const io = new IntersectionObserver(
      () => {
        const r = wrap.getBoundingClientRect();
        if (r.top <= innerHeight * 0.6 && r.bottom > 0) start();
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    io.observe(wrap);

    return () => {
      io.disconnect();
      anim?.cancel();
      timers.forEach(clearTimeout);
      timers = [];
      section.removeEventListener("audit:live", onLive);
      /* desmontou no meio: a próxima montagem mostra direto */
      if (opened) {
        section.dataset.in = section.dataset.done = section.dataset.shown = "";
        dot.style.display = "none";
      }
    };
  }, []);

  return (
    <div ref={ref} className="audit-wrap">
      <div ref={iris} className="audit-iris" aria-hidden="true" />
      {children}
    </div>
  );
}
