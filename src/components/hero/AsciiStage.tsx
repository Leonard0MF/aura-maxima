"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import type { Levels } from "@/lib/ascii/core";

/* WebGL + interação num chunk próprio, carregado só depois do primeiro paint. */
const AsciiCanvas = dynamic(() => import("@/components/ascii/AsciiCanvas"), { ssr: false });

/*
 * O script de boot marca data-fx="static" com reduced-motion ou
 * hardwareConcurrency ≤ 4: aí fica só o <pre> gerado no build. Se o WebGL2
 * (ou a foto) falhar, voltamos para ele também.
 */
export function AsciiStage({ src, aspect, levels }: { src: string; aspect: number; levels: Levels }) {
  const [ready, setReady] = useState(false);
  const fail = useCallback(() => {
    document.documentElement.dataset.fx = "static";
    setReady(false);
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.fx === "static") return;
    const go = () => setReady(true);
    /* com a montagem de entrada, carrega já (a tipografia anima junto) */
    if (document.documentElement.dataset.intro === "1") {
      const id = setTimeout(go, 0);
      return () => clearTimeout(id);
    }
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(go, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(go, 300);
    return () => clearTimeout(id);
  }, []);

  return ready ? <AsciiCanvas src={src} aspect={aspect} levels={levels} onFail={fail} /> : null;
}
