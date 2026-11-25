"use client";

import dynamic from "next/dynamic";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { TerminalData } from "./terminal/types";

/* O terminal (≈7 KB) só é baixado quando alguém abre o overlay. */
const ReconTerminal = dynamic(() => import("./terminal/ReconTerminal").then((m) => m.ReconTerminal), { ssr: false });

function isTyping(el: EventTarget | null) {
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

export function TerminalDock({ data }: { data: TerminalData }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);

  const open = () => {
    setMounted(true);
    ref.current?.showModal();
    window.setTimeout(() => document.getElementById("term-input")?.focus(), 50);
  };

  const toggle = useEffectEvent(() => {
    if (ref.current?.open) ref.current.close();
    else open();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      /* "~" no layout US (Backquote) e no ABNT2 (tecla morta em Quote) */
      if (e.key === "~" || e.code === "Backquote" || (e.key === "Dead" && e.code === "Quote")) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="fixed right-4 bottom-4 z-40 flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-[#111317] px-4 font-mono text-xs text-[#e6e8eb] shadow-lg transition-colors duration-150 hover:border-accent sm:right-6 sm:bottom-6"
      >
        <span aria-hidden="true" className="text-accent">
          ~
        </span>
        terminal
      </button>
      <dialog
        ref={ref}
        aria-label="Terminal"
        className="theme-dark m-auto w-[min(780px,calc(100vw-2rem))] bg-transparent p-0 backdrop:bg-black/60 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === ref.current) ref.current.close();
        }}
      >
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="min-h-9 rounded-md border border-white/10 bg-[#111317] px-3 font-mono text-xs text-[#a3acb6] hover:text-white"
          >
            fechar <span aria-hidden="true">[esc]</span>
          </button>
        </div>
        {mounted ? <ReconTerminal data={data} /> : null}
      </dialog>
    </>
  );
}
