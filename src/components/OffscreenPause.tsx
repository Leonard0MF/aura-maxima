"use client";

import { useEffect } from "react";

/* elementos com animação CSS infinita */
const LOOPING = ".about-pulse, .journey__item[data-next] .journey__dot, .stack-ph";

/*
 * Pausa as animações CSS infinitas fora da tela (pulso do ABOUT e da
 * trajetória, placeholder da STACK): cada elemento ganha data-off enquanto
 * não está na viewport, e o CSS põe a animação em animation-play-state:
 * paused. Sem isso, cada pulso fora da tela ainda gera um quadro da main
 * thread a cada 16 ms. Os loops WebGL já param sozinhos (lib/gl-slot e o
 * canvas do hero).
 */
export function OffscreenPause() {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>(LOOPING)];
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) delete el.dataset.off;
        else el.dataset.off = "";
      }
    });
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      els.forEach((el) => delete el.dataset.off);
    };
  }, []);
  return null;
}
