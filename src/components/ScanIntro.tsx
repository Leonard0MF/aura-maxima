"use client";

import { useEffect } from "react";

import { profile, scanLines } from "@/content/profile";

const SEEN_KEY = "recon:intro-seen";

/*
 * Abertura em estilo terminal.
 *
 * Visibilidade e timing são 100% CSS (globals.css, `.scan`): o script de
 * boot no <head> só liga `data-intro="on"` na primeira visita da sessão e
 * sem prefers-reduced-motion. Este componente apenas:
 *  - marca a sessão como vista;
 *  - permite pular (botão, Esc ou clique);
 *  - desliga o overlay quando a animação de saída termina.
 */
export function ScanIntro() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.intro !== "on") return;

    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* sem storage: o scan volta a tocar na próxima visita, sem problema */
    }

    const finish = () => {
      if (root.dataset.intro === "on") delete root.dataset.intro;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    const timer = window.setTimeout(finish, 2600);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const skip = () => {
    delete document.documentElement.dataset.intro;
  };

  return (
    <div
      className="scan fixed inset-0 z-50 items-center justify-center bg-bg px-4"
      onClick={skip}
    >
      <p className="sr-only">Introdução animada: relatório de reconhecimento sobre {profile.name}.</p>
      <button
        type="button"
        onClick={skip}
        className="absolute top-4 right-4 min-h-10 rounded-md border border-line px-4 font-mono text-xs text-muted hover:border-accent hover:text-fg"
      >
        Pular <span aria-hidden="true">[esc]</span>
      </button>
      <div aria-hidden="true" className="w-full max-w-xl font-mono text-[13px] leading-7 sm:text-sm">
        <p className="text-fg">
          <span className="text-accent">$</span> recon --target &quot;{profile.name}&quot;
        </p>
        {scanLines.map((line, i) => (
          <p key={line.label} className="scan-line flex gap-1 text-muted" style={{ "--i": i + 1 } as React.CSSProperties}>
            <span className="text-accent">[+]</span>
            <span>{line.label}</span>
            <span className="scan-dots" />
            <span className="text-fg">{line.result}</span>
          </p>
        ))}
        <p className="scan-line cursor text-ok" style={{ "--i": scanLines.length + 1 } as React.CSSProperties}>
          [✓] report ready
        </p>
      </div>
    </div>
  );
}
