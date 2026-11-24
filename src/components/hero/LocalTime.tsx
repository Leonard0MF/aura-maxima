"use client";

import { useSyncExternalStore } from "react";

const fmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function subscribe(cb: () => void) {
  const id = window.setInterval(cb, 15_000);
  return () => window.clearInterval(id);
}

/* Relógio de São Paulo. No HTML estático aparece "--:--" até hidratar. */
export function LocalTime() {
  const time = useSyncExternalStore(subscribe, () => fmt.format(new Date()), () => "--:--");
  return <time suppressHydrationWarning>{time}</time>;
}
