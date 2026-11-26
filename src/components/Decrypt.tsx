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
 *
 * trigger="event": não roda ao entrar na tela; roda a cada evento "decrypt"
 * disparado no elemento (data-decrypt), p.ex. o hover do print no WORK.
 * dur: duração total em ms (padrão 800).
 */
export function Decrypt({ text, className, trigger = "view", dur = 800 }: { text: string; className?: string; trigger?: "view" | "event"; dur?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const chars = [...el.querySelectorAll<HTMLElement>("[data-c]")];
    let raf = 0;
    let start = 0;
    const DUR = dur;

    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      let busy = false;
      chars.forEach((c, i) => {
        const lock = DUR * 0.15 + (i / Math.max(1, chars.length - 1)) * DUR * 0.75;
        if (t < lock) {
          busy = true;
          /* troca de glifo a cada ~60 ms (efeito curto: ~40 ms), não a cada frame */
          const k = Math.floor(t / Math.min(60, DUR / 10)) + i * 7;
          c.dataset.s = NOISE[(k * 13 + i * 5) % NOISE.length];
        } else if (c.dataset.s) {
          delete c.dataset.s;
        }
      });
      raf = busy ? requestAnimationFrame(tick) : 0;
    };

    const play = () => {
      cancelAnimationFrame(raf);
      start = 0;
      raf = requestAnimationFrame(tick);
    };
    if (trigger === "event") {
      el.addEventListener("decrypt", play);
      return () => {
        el.removeEventListener("decrypt", play);
        cancelAnimationFrame(raf);
        chars.forEach((c) => delete c.dataset.s);
      };
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        play();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      chars.forEach((c) => delete c.dataset.s);
    };
  }, [text, trigger, dur]);

  return (
    <span ref={ref} className={className} data-decrypt={trigger === "event" ? "" : undefined}>
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
