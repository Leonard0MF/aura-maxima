"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { body, display, mono } from "./fonts";

/*
 * ============================================================
 * STORM INTRO
 * ============================================================
 *
 * show() -> sequência de entrada (tempo real, não ligada ao scroll)
 * hide() -> some rápido, sem delays (usado no retorno)
 *
 * Sequência:
 *   0ms     linhas laterais do eyebrow "desenham"
 *   250ms   eyebrow DECODIFICA: ruído -> texto (chaos -> systems)
 *   300ms+  título sobe por trás de uma máscara, linha a linha
 *   1000ms  parágrafo
 *   1500ms  rodapé
 *
 * O eyebrow usa fonte monoespaçada, então o decode não causa
 * layout shift.
 * ============================================================
 */

export type StormIntroHandle = {
  show: () => void;
  hide: () => void;
};

const EYEBROW = "FROM CHAOS TO SYSTEMS";
const LINES = ["I BUILD", "THROUGH", "COMPLEXITY."];
const GLYPHS = "01#/\\|<>[]{}=+*%&$";
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

const StormIntro = forwardRef<StormIntroHandle>(function StormIntro(
  _props,
  ref
) {
  const [visible, setVisible] = useState(false);
  const eyebrowRef = useRef<HTMLSpanElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      show: () => setVisible(true),
      hide: () => setVisible(false),
    }),
    []
  );

  /* Decode do eyebrow: ruído -> texto, da esquerda para a direita. */
  useEffect(() => {
    const el = eyebrowRef.current;
    if (!el) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (!visible || reduced) {
      el.textContent = EYEBROW;
      return;
    }

    const t0 = performance.now() + 250;
    const resolveAt = Array.from(
      EYEBROW,
      (_, i) => 300 + i * 40 + Math.random() * 140
    );

    let raf = 0;

    const tick = (now: number) => {
      const t = now - t0;
      const frame = Math.floor(now / 55);

      let out = "";
      let done = true;

      for (let i = 0; i < EYEBROW.length; i++) {
        const ch = EYEBROW[i];

        if (ch === " ") {
          out += " ";
        } else if (t >= resolveAt[i]) {
          out += ch;
        } else {
          done = false;
          out += GLYPHS[(i * 7 + frame * 13) % GLYPHS.length];
        }
      }

      el.textContent = out;

      if (done) {
        el.textContent = EYEBROW;
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [visible]);

  /* Estilo de entrada com delay; a saída é rápida e sem delay. */
  const reveal = (
    delay: number,
    duration = 1100,
    from = "translate3d(0, 110%, 0)"
  ): React.CSSProperties => ({
    transform: visible ? "translate3d(0, 0, 0)" : from,
    opacity: visible ? 1 : 0,
    filter: visible ? "blur(0px)" : "blur(10px)",
    transition: visible
      ? `transform ${duration}ms ${EASE} ${delay}ms, opacity ${
          duration * 0.6
        }ms ease ${delay}ms, filter ${duration}ms ${EASE} ${delay}ms`
      : "opacity 260ms ease, transform 0s linear 260ms, filter 0s linear 260ms",
  });

  const line = (
    origin: "left" | "right"
  ): React.CSSProperties => ({
    transformOrigin: origin,
    transform: visible ? "scaleX(1)" : "scaleX(0)",
    transition: visible
      ? `transform 900ms ${EASE} 100ms`
      : "transform 0s linear 260ms",
    background:
      origin === "right"
        ? "linear-gradient(to right, transparent, rgba(158,195,230,0.75))"
        : "linear-gradient(to left, transparent, rgba(158,195,230,0.75))",
  });

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[48] flex select-none flex-col items-center justify-center px-6 text-center"
      aria-hidden={!visible}
    >
      {/* Scrim: garante leitura sobre o brilho das nuvens do vídeo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(3,10,20,0.58), transparent 72%)",
          opacity: visible ? 1 : 0,
          transition: visible
            ? "opacity 1200ms ease 100ms"
            : "opacity 260ms ease",
        }}
      />

      <div className="relative flex flex-col items-center pb-10">
        {/* EYEBROW */}
        <div className="mb-6 flex items-center gap-4 md:mb-9 md:gap-6">
          <span
            aria-hidden
            className="block h-px w-10 md:w-20"
            style={line("right")}
          />

          <span
            className={`${mono.className} text-[10px] font-medium tracking-[0.42em] text-[#9ec3e6] md:text-xs`}
            style={reveal(100, 700, "translate3d(0, 0, 0)")}
          >
            <span ref={eyebrowRef}>{EYEBROW}</span>
          </span>

          <span
            aria-hidden
            className="block h-px w-10 md:w-20"
            style={line("left")}
          />
        </div>

        {/* TÍTULO */}
        <h2
          className={`${display.className} text-[clamp(2.2rem,9.4vw,8.5rem)] font-extrabold leading-[0.9] tracking-[-0.025em]`}
          aria-label="I build through complexity."
        >
          {LINES.map((text, i) => (
            <span key={text} className="block overflow-hidden pb-[0.07em]">
              <span
                className="block"
                style={{
                  ...reveal(300 + i * 140),
                  backgroundImage:
                    "linear-gradient(180deg, #ffffff 25%, #bcd3ea 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {text}
              </span>
            </span>
          ))}
        </h2>

        {/* TEXTO */}
        <p
          className={`${body.className} mt-7 max-w-[34rem] text-[clamp(0.95rem,1.45vw,1.25rem)] leading-[1.65] text-[#d6e4f2]/75 md:mt-10`}
          style={reveal(1000, 900, "translate3d(0, 16px, 0)")}
        >
          I turn complex ideas into reliable,
          <br className="hidden sm:block" /> scalable and purposeful digital
          systems.
        </p>
      </div>

      {/* RODAPÉ */}
      <p
        className={`${mono.className} absolute bottom-8 text-[9px] tracking-[0.34em] text-white/45 md:bottom-10 md:text-[11px]`}
        style={reveal(1500, 900, "translate3d(0, 10px, 0)")}
      >
        DEVELOPMENT <span className="text-white/25">·</span> SYSTEMS{" "}
        <span className="text-white/25">·</span> SECURITY
      </p>
    </div>
  );
});

StormIntro.displayName = "StormIntro";

export default StormIntro;