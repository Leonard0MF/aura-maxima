"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

/* WebGL + interação num chunk próprio, carregado só depois do primeiro paint. */
const AsciiPortrait = dynamic(() => import("./AsciiPortrait"), { ssr: false });

/*
 * O script de boot marca data-ascii="static" com reduced-motion ou
 * hardwareConcurrency ≤ 4: aí fica só o <pre> gerado no build. Se o WebGL2
 * falhar, voltamos para ele também.
 */
export function AsciiStage({ src, aspect }: { src: string | null; aspect: number }) {
  const [ready, setReady] = useState(false);
  const fail = useCallback(() => {
    document.documentElement.dataset.ascii = "static";
    setReady(false);
  }, []);

  useEffect(() => {
    if (document.documentElement.dataset.ascii === "static") return;
    const go = () => setReady(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(go, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(go, 300);
    return () => clearTimeout(id);
  }, []);

  return ready ? <AsciiPortrait src={src} aspect={aspect} onFail={fail} /> : null;
}
