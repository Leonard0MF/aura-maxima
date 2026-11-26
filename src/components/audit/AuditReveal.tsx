"use client";

import { useEffect, useRef } from "react";

import { holeCenter } from "./layout";

/*
 * Entrada do AUDIT: animação de TEMPO, não de rolagem (nada fica preso na
 * tela; a página rola sempre).
 *
 * Quando o topo da seção cruza ~60% da viewport, um círculo escuro nasce no
 * centro do buraco negro e se expande até cobrir a seção em ~900 ms
 * (ease-out), com um anel âmbar fino na borda. Uma vez por entrada: quando a
 * seção sai inteira da tela, volta ao início sem animar. O centro vem da
 * mesma conta da cena (layout.holeCenter) sobre a caixa real do campo.
 *
 * Com reduced-motion: fade de 300 ms. Sem JS: a seção aparece pronta.
 * O modo (data-reveal) é decidido no script de boot, antes da 1ª pintura.
 */
export function AuditReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = ref.current!;
    const section = wrap.querySelector<HTMLElement>("section")!;
    const field = section.querySelector<HTMLElement>(".audit-field");

    const center = () => {
      if (!field) return;
      const s = section.getBoundingClientRect(), f = field.getBoundingClientRect();
      if (!f.width || !f.height) return;
      const c = holeCenter(f.width, f.height);
      const x = f.left - s.left + c.x, y = f.top - s.top + c.y;
      wrap.style.setProperty("--bhx", `${x.toFixed(1)}px`);
      wrap.style.setProperty("--bhy", `${y.toFixed(1)}px`);
      /* raio que cobre a seção inteira: até o canto mais distante */
      wrap.style.setProperty("--rmax", `${Math.ceil(Math.hypot(Math.max(x, s.width - x), Math.max(y, s.height - y)) + 2)}px`);
    };
    const ro = new ResizeObserver(center);
    ro.observe(section);
    if (field) ro.observe(field);
    center();

    /* entra: topo cruza 60% da viewport (a margem de baixo corta 40%) */
    const ioIn = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) section.dataset.in = "";
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    /* saiu inteira: reseta sem animar, para a próxima entrada */
    const ioOut = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) return;
      section.dataset.reset = "";
      delete section.dataset.in;
      requestAnimationFrame(() => requestAnimationFrame(() => delete section.dataset.reset));
    });
    ioIn.observe(section);
    ioOut.observe(section);
    return () => {
      ro.disconnect();
      ioIn.disconnect();
      ioOut.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="audit-wrap">
      {children}
      <div className="audit-ring" aria-hidden="true" />
    </div>
  );
}
