"use client";

import { useEffect, useRef } from "react";

/*
 * Transição "cair no buraco negro" do AUDIT.
 *
 * Estrutura: .audit-pin (o trecho de rolagem da transição; sobe meia tela
 * por cima do fim da STACK e desce meia tela por cima do começo do ABOUT)
 *   > .audit-stick (sticky, uma tela)
 *       > section.audit  (clip-path: circle(r at centro do buraco negro))
 *       > .audit-ring    (anel âmbar fino no limite do círculo)
 *
 * O raio vem de duas variáveis no .audit-pin: --ko (abre, 0→1) e --kc
 * (fecha, 1→0). Com scroll-driven animations (data-pin="css", decidido no
 * script de boot) o CSS anima as duas pela view-timeline do .audit-pin; sem
 * suporte (data-pin="js") um único rAF por rolagem escreve as mesmas
 * variáveis, sem estado React. Com reduced-motion não há pin: a seção entra
 * com um fade de 300 ms (data-in, via IntersectionObserver).
 */
export const PIN = { open: 0.7, rest: 0.8, close: 0.7 }; // em telas (svh)

export function AuditPin({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pin = ref.current!;
    const html = document.documentElement;
    const section = pin.querySelector<HTMLElement>("section")!;

    /* reduced-motion: fade simples */
    if (!html.dataset.pin) {
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) section.dataset.in = "";
        else delete section.dataset.in;
      }, { threshold: 0.15 });
      io.observe(section);
      return () => io.disconnect();
    }
    if (html.dataset.pin !== "js") return;

    /* fallback em JS: um rAF por rolagem, escrita direta no estilo */
    const tall = matchMedia("(min-height: 521px)");
    let raf = 0;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const frame = () => {
      raf = 0;
      if (!tall.matches) {
        pin.style.removeProperty("--ko");
        pin.style.removeProperty("--kc");
        return;
      }
      const vh = innerHeight;
      const s = -pin.getBoundingClientRect().top;
      const ko = clamp(s / (PIN.open * vh));
      const kc = 1 - clamp((s - (PIN.open + PIN.rest) * vh) / (PIN.close * vh));
      pin.style.setProperty("--ko", ko.toFixed(4));
      pin.style.setProperty("--kc", kc.toFixed(4));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    frame();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div ref={ref} className="audit-pin">
      {/* âncora do menu (#auditoria): o ponto da rolagem em que o círculo já abriu */}
      <span id="auditoria" className="audit-anchor" aria-hidden="true" />
      <div className="audit-stick">
        {children}
        <div className="audit-ring" aria-hidden="true" />
      </div>
    </div>
  );
}
