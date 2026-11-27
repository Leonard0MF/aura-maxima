import type { ReactNode } from "react";

import { Decrypt } from "@/components/Decrypt";

/*
 * Cabeçalho compacto de seção (tipografia gigante é só do hero):
 * "01 — WORK" em mono + título display clamp(48px, 7vw, 112px) com uma
 * frase curta ao lado.
 */
export function SectionHead({ n, label, title, id, children, meta, decrypt = "view" }: { n: string; label: string; title: string; id: string; children?: ReactNode; meta?: ReactNode; decrypt?: "view" | "event" }) {
  return (
    <header className="sh">
      <div className="sh-label">
        <span>
          {n} — {label}
        </span>
        {meta && <span className="text-right opacity-70">{meta}</span>}
      </div>
      <div className="sh-row">
        <h2 id={id} className="sh-title font-display">
          <Decrypt text={title} trigger={decrypt} />
        </h2>
        {children && <p className="sh-lede">{children}</p>}
      </div>
    </header>
  );
}
