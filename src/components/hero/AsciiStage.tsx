"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BgImage } from "@/components/ascii/AsciiCanvas";
import type { Levels } from "@/lib/ascii/core";
import { claimGL } from "@/lib/gl-slot";

/* WebGL + interação num chunk próprio, carregado só depois do primeiro paint. */
const AsciiCanvas = dynamic(() => import("@/components/ascii/AsciiCanvas"), { ssr: false });

/*
 * O script de boot marca data-fx="static" com reduced-motion ou
 * hardwareConcurrency ≤ 4: aí fica só o <pre> gerado no build. Se o WebGL2
 * (ou a foto) falhar, voltamos para ele também.
 * lib/gl-slot: o hero só tem o canvas perto da tela (≤ 1,5 viewport); longe
 * (> 2,5), o canvas é desmontado (contexto liberado) e volta ao chegar perto.
 */
export function AsciiStage({ src, aspect, levels, bg }: { src: string; aspect: number; levels: Levels; bg?: BgImage }) {
  const [ready, setReady] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const fail = useCallback(() => {
    document.documentElement.dataset.fx = "static";
    setReady(false);
  }, []);

  useEffect(() => {
    const el = anchor.current?.closest("section");
    if (!el || document.documentElement.dataset.fx === "static") return;
    let idle = false; // o primeiro paint já passou
    let owner = false; // o hero é o dono do WebGL
    const go = () => setReady(idle && owner && document.documentElement.dataset.fx !== "static");
    const release = claimGL({
      el,
      prepare() {
        owner = true;
        go();
      },
      release() {
        owner = false;
        go();
        /* o canvas libera o contexto no cleanup (setTimeout 0): espera passar */
        return new Promise<void>((r) => setTimeout(r, 32));
      },
      /* o loop do hero já para sozinho fora da tela (IntersectionObserver) */
      run() {},
    });
    const first = () => {
      idle = true;
      go();
    };
    let cancel = () => {};
    /* com a montagem de entrada, carrega já (a tipografia anima junto) */
    if (document.documentElement.dataset.intro === "1") {
      const id = setTimeout(first, 0);
      cancel = () => clearTimeout(id);
    } else if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(first, { timeout: 1500 });
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = setTimeout(first, 300);
      cancel = () => clearTimeout(id);
    }
    return () => {
      cancel();
      release();
    };
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      {ready && <AsciiCanvas src={src} aspect={aspect} levels={levels} bg={bg} onFail={fail} />}
    </>
  );
}
