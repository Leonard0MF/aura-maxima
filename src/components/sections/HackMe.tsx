import { Decrypt } from "@/components/Decrypt";

import { HackMeLab } from "./HackMeLab";

/* 03 · HACK ME: laboratório de SQL injection, educativo e 100% no navegador. */
export function HackMe() {
  return (
    <section id="hackme" aria-labelledby="hackme-title" className="bg-paper text-ink">
      <header className="sec-head">
        <div className="sec-meta">
          <span>03</span>
          <span className="text-ink-soft">sqlmap --level=1 --risk=1 (simulado)</span>
          <span>client-side</span>
        </div>
        <h2 id="hackme-title" className="sec-title font-display">
          <Decrypt text="HACK ME" />
        </h2>
        <p className="mt-8 max-w-[38ch] text-xl leading-snug sm:text-2xl">
          Tente me hackear. <span className="text-ink-soft">Um login vulnerável a SQL injection, e a versão corrigida ao lado.</span>
        </p>
      </header>
      <div className="px-4 pb-6 sm:px-6">
        <div className="border-y border-ink/15">
          <HackMeLab />
        </div>
        <p className="mt-4 pb-14 font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:pb-20 sm:text-xs">
          Simulação educativa, sem servidor e sem banco reais. Nunca teste isso em sistemas sem autorização.
        </p>
      </div>
    </section>
  );
}
