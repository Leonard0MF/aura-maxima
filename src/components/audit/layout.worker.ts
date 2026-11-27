/*
 * Gera as posições das partículas do AUDIT fora da main thread e devolve os
 * buffers transferidos (sem cópia). O AuditField pede uma vez por sessão.
 */
import { makeLayout } from "./layout";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ n: number; count: number; narrow?: boolean }>) => void) | null;
  postMessage(m: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = (e) => {
  const L = makeLayout(e.data.n, e.data.count, undefined, !!e.data.narrow);
  ctx.postMessage(L, [L.points.buffer, L.ref.buffer, L.seeds.buffer, L.tones.buffer, L.sizes.buffer]);
};
