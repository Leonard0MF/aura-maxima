"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

/* WebGL num chunk próprio, carregado só depois do primeiro paint. */
const OrbCanvas = dynamic(() => import("./OrbCanvas"), { ssr: false });

/*
 * O script de boot já marca data-orb="static" com reduced-motion ou
 * hardwareConcurrency ≤ 4. Aqui só esperamos o navegador ficar ocioso para
 * montar o canvas; se o WebGL2 falhar, caímos para a imagem estática (CSS).
 */
export function OrbStage() {
  const [ready, setReady] = useState(false);
  const fail = useCallback(() => {
    document.documentElement.dataset.orb = "static";
    setReady(false);
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.orb === "static") return;
    const go = () => setReady(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(go, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(go, 300);
    return () => clearTimeout(id);
  }, []);

  return ready ? <OrbCanvas onFail={fail} /> : null;
}
