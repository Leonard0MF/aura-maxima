"use client";

import { useEffect, useRef } from "react";

const NOISE = "#%@*+=<>/{}[]01$&?!";

/*
 * Texto que "descriptografa" ao entrar na tela: cada caractere mostra glifos
 * aleatórios e trava no certo, da esquerda para a direita (~0,8 s, uma vez).
 *
 * O caractere original continua no layout (invisível durante o efeito) e o
 * glifo aleatório vem num ::after centrado por cima, então a largura não muda
 * (sem CLS, mesmo em fonte proporcional). Leitores de tela leem o texto final;
 * sem JS ou com reduced-motion, o texto aparece direto.
 */
export function Decrypt({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const chars = [...el.querySelectorAll<HTMLElement>("[data-c]")];
    let raf = 0;
    let start = 0;
    const DUR = 800;

    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      let busy = false;
      chars.forEach((c, i) => {
        const lock = 120 + (i / Math.max(1, chars.length - 1)) * (DUR - 200);
        if (t < lock) {
          busy = true;
          /* troca de glifo a cada ~60 ms, não a cada frame */
          const k = Math.floor(t / 60) + i * 7;
          c.dataset.s = NOISE[(k * 13 + i * 5) % NOISE.length];
        } else if (c.dataset.s) {
          delete c.dataset.s;
        }
      });
      raf = busy ? requestAnimationFrame(tick) : 0;
    };

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      chars.forEach((c) => delete c.dataset.s);
    };
  }, [text]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {[...text].map((ch, i) =>
          ch === " " ? (
            " "
          ) : (
            <span key={i} data-c="" className="dc">
              {ch}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
