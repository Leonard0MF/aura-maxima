"use client";

import { useRef } from "react";

import type { AsciiImageData } from "@/lib/ascii/image";

/*
 * Retrato do ABOUT: versão leve do efeito do hero, sem WebGL.
 *   - por cima: o ASCII estático gerado no build (respeita o alpha: fora da
 *     silhueta não há glifo);
 *   - por baixo: a foto em cores naturais, recortada pelo próprio alpha.
 * Um círculo (máscara radial em CSS, raio --r animado) revela a foto onde
 * estão o mouse ou o dedo, e o ASCII some dentro dele. Mouse: abre ao entrar e
 * fecha ao sair. Toque: segue o dedo e fecha pouco depois de soltar. Sem JS,
 * fica só o ASCII (com a foto como alt).
 */
export function AboutPortrait({ portrait, alt }: { portrait: AsciiImageData; alt: string }) {
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef(0);

  const at = (e: React.PointerEvent) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--x", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--y", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    /* raio em px (--r é <length> registrado, para animar): ~1/3 da largura */
    el.style.setProperty("--R", `${Math.round(Math.min(160, Math.max(70, r.width * 0.32)))}px`);
  };
  const open = (on: boolean) => {
    window.clearTimeout(timer.current);
    box.current?.toggleAttribute("data-open", on);
  };

  return (
    <div
      ref={box}
      className="about-portrait"
      style={{ aspectRatio: String(portrait.aspect), "--a": portrait.aspect } as React.CSSProperties}
      onPointerEnter={(e) => {
        at(e);
        open(true);
      }}
      onPointerMove={at}
      onPointerDown={(e) => {
        at(e);
        open(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") open(false);
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== "mouse") timer.current = window.setTimeout(() => open(false), 1400);
      }}
      onPointerCancel={() => {
        timer.current = window.setTimeout(() => open(false), 1400);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- mesma URL otimizada do hero (já em cache) */}
      <img
        className="about-portrait__photo"
        src={portrait.src}
        alt={alt}
        decoding="async"
        loading="lazy"
        style={{ "--m": `url(${portrait.mask})` } as React.CSSProperties}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado no build, nada a otimizar */}
      <img className="about-portrait__ascii" src={portrait.svg.src} width={portrait.svg.width} height={portrait.svg.height} alt="" aria-hidden="true" decoding="async" />
    </div>
  );
}
