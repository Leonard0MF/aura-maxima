import type { ReactNode } from "react";

/*
 * Entrada de seção: o estado oculto e a transição (300 ms) ficam no CSS
 * (globals.css, [data-reveal]); o RevealObserver só adiciona `.is-in`.
 * Sem JS ou com reduced-motion, o conteúdo nunca fica escondido.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <div data-reveal="" className={className} style={delay ? ({ "--d": `${Math.round(delay * 1000)}ms` } as React.CSSProperties) : undefined}>
      {children}
    </div>
  );
}
