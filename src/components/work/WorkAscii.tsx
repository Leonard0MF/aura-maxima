"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { Levels } from "@/lib/ascii/core";

import { getActive, register, subscribe } from "./active";

/* mesmo chunk do hero: o renderer é um só */
const AsciiCanvas = dynamic(() => import("@/components/ascii/AsciiCanvas"), { ssr: false });

/*
 * Canvas do print de um projeto. Só monta quando o bloco está em cena; ao
 * sair, desmonta (libera o contexto WebGL) e o SVG estático do build volta.
 * Modo estático (reduced-motion, aparelho fraco) ou falha → nunca monta.
 */
export function WorkAscii({ src, aspect, levels }: { src: string; aspect: number; levels: Levels }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [block, setBlock] = useState<HTMLElement | null>(null);
  const [failed, setFailed] = useState(false);
  const active = useSyncExternalStore(subscribe, getActive, () => null);
  const onFail = useCallback(() => setFailed(true), []);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el || document.documentElement.dataset.ascii === "static") return;
    setBlock(el);
    return register(el);
  }, []);

  return (
    <>
      <span ref={ref} hidden />
      {block && active === block && !failed ? (
        <AsciiCanvas src={src} aspect={aspect} levels={levels} preset="work" onFail={onFail} />
      ) : null}
    </>
  );
}
