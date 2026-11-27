/*
 * Gera as posições das partículas do AUDIT fora da main thread e devolve os
 * buffers transferidos (sem cópia). O AuditField pede uma vez por sessão.
 */
import { makeLayout } from "./layout";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ n: number; count: number }>) => void) | null;
  postMessage(m: unknown, transfer: Transferable[]): void;
};

ctx.onmessage = (e) => {
  const L = makeLayout(e.data.n, e.data.count);
  ctx.postMessage(L, [L.nodes.buffer, L.points.buffer, L.seeds.buffer, L.tones.buffer, L.sizes.buffer]);
};
