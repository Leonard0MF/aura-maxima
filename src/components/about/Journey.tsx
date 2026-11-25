"use client";

import { useEffect, useId, useRef, useState } from "react";

export type Milestone = { date: string; title: string; phrase: string };

const isTodo = (s: string) => s.trim().startsWith("TODO");

/*
 * Trajetória: horizontal no desktop, vertical no celular.
 * Cada marco desenha o segmento até o próximo (SVG, stroke-dashoffset 1 → 0
 * com pathLength = 1), em sequência, quando o bloco entra na tela; o último
 * segmento, até o objetivo, é tracejado e revelado por uma máscara que anima
 * do mesmo jeito. Hover/foco/toque mostra a frase do marco (espaço reservado:
 * nada pula). Sem JS ou com reduced-motion, tudo aparece pronto (CSS).
 */
export function Journey({ items, label }: { items: Milestone[]; label: string }) {
  const list = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.dataset.in = "1";
        io.disconnect();
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const last = items.length - 1;
  return (
    <ol ref={list} className="journey" aria-label={label} style={{ "--n": items.length } as React.CSSProperties}>
      {items.map((m, i) => {
        const next = i === last;
        const dashed = i === last - 1;
        const phrase = isTodo(m.phrase) ? "" : m.phrase;
        const on = active === i;
        return (
          <li key={i} className="journey__item" data-next={next || undefined} data-on={on || undefined} style={{ "--i": i } as React.CSSProperties}>
            {!next && (
              <svg className="journey__seg" aria-hidden="true">
                {dashed && (
                  <defs>
                    <mask id={`${uid}-h`} maskUnits="userSpaceOnUse">
                      <line className="journey__draw" x1="0" y1="50%" x2="100%" y2="50%" pathLength={1} stroke="#fff" strokeWidth="6" />
                    </mask>
                    <mask id={`${uid}-v`} maskUnits="userSpaceOnUse">
                      <line className="journey__draw" x1="50%" y1="0" x2="50%" y2="100%" pathLength={1} stroke="#fff" strokeWidth="6" />
                    </mask>
                  </defs>
                )}
                <line
                  className={`journey__h ${dashed ? "journey__dash" : "journey__draw"}`}
                  x1="0" y1="50%" x2="100%" y2="50%"
                  pathLength={dashed ? undefined : 1}
                  mask={dashed ? `url(#${uid}-h)` : undefined}
                />
                <line
                  className={`journey__v ${dashed ? "journey__dash" : "journey__draw"}`}
                  x1="50%" y1="0" x2="50%" y2="100%"
                  pathLength={dashed ? undefined : 1}
                  mask={dashed ? `url(#${uid}-v)` : undefined}
                />
              </svg>
            )}
            <span className="journey__dot" aria-hidden="true" />
            <button
              type="button"
              className="journey__btn"
              aria-expanded={phrase ? on : undefined}
              disabled={!phrase || undefined}
              onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
              onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              /* toque: abre (o foco já abre; fecha ao tocar fora, via blur) */
              onClick={() => setActive(i)}
            >
              <span className="journey__date">{isTodo(m.date) ? "—" : m.date}</span>
              <span className="journey__title">{m.title}</span>
            </button>
            {phrase && (
              <p className="journey__phrase">
                <span>{phrase}</span>
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
