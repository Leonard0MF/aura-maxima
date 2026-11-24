import type { ReactNode } from "react";

/*
 * Renderiza o texto dos dois modos. O CSS global esconde o que não
 * vale para o modo atual (ver `.t-term` / `.t-clean` em globals.css).
 */
export function Dual({ term, clean }: { term: ReactNode; clean: ReactNode }) {
  return (
    <>
      <span className="t-term">{term}</span>
      <span className="t-clean">{clean}</span>
    </>
  );
}
