"use client";

import { useEffect } from "react";

/* CTF · flag 1 de 3. Não é segredo: é um convite para quem abre o DevTools. */
/* text vem de messages (ctf.console), com {flag} no lugar da flag */
export function ConsoleFlag({ text }: { text: string }) {
  useEffect(() => {
    const [before, after] = text.split("{flag}");
    console.log(
      `%c[recon]%c ${before}%cLEO{devtools_never_lies}%c${after}`,
      "color:#f5a524;font-weight:700",
      "color:inherit",
      "color:#f5a524;font-family:monospace",
      "color:inherit",
    );
  }, [text]);
  return null;
}
