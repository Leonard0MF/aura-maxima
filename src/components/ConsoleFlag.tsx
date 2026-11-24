"use client";

import { useEffect } from "react";

/* CTF · flag 1 de 3. Não é segredo: é um convite para quem abre o DevTools. */
export function ConsoleFlag() {
  useEffect(() => {
    console.log(
      "%c[recon]%c Curioso, hein? Flag 1/3: %cLEO{devtools_never_lies}%c\nJunte as 3 e envie em /flag.",
      "color:#f5a524;font-weight:700",
      "color:inherit",
      "color:#f5a524;font-family:monospace",
      "color:inherit",
    );
  }, []);
  return null;
}
