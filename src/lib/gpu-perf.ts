/*
 * Qualidade do AUDIT sem trabalho extra (nenhum benchmark): reaproveita o
 * que a STACK já mede enquanto roda — o intervalo entre quadros seguidos do
 * loop dela (física + render, com a GPU de verdade). Do aparelho, só sinais
 * confiáveis viram piso: memória INFORMADA ≤ 2 GB e GPU integrada antiga
 * (núcleos não: o Safari do iPhone informa 4; deviceMemory ausente não conta).
 *
 * Níveis (scene.ts, LADDER): 0 lente 1,0 · 1 lente 0,75 · 2 lente 0,5 · 3 simple.
 */
const samples: number[] = [];

/** a STACK chama a cada quadro encadeado (o anterior pediu este) */
export function recordFrame(ms: number) {
  if (!(ms > 2 && ms < 250)) return;
  samples.push(ms);
  if (samples.length > 240) samples.shift();
}

/** mediana dos intervalos (ms), ou null com menos de 30 quadros medidos */
export function frameMs() {
  if (samples.length < 30) return null;
  const s = [...samples].sort((a, b) => a - b);
  return s[s.length >> 1];
}

export type Pick = { level: number; why: string };

export function pickLevel(gl: WebGLRenderingContext | WebGL2RenderingContext, simple: boolean): Pick {
  if (simple) return { level: 3, why: "toque/celular" };
  let gpu = "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
  } catch {
    /* sem o nome: só os outros sinais */
  }
  const cores = navigator.hardwareConcurrency || 0;
  /* o Safari não informa deviceMemory: ausente = desconhecido (não rebaixa) */
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0;
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(gpu)) return { level: 3, why: `GPU por software (${gpu})` };

  /* piso pelo aparelho: só sinais confiáveis (memória INFORMADA ≤ 2 GB ou
   * GPU integrada antiga); núcleos sozinhos nunca rebaixam (o Safari do
   * iPhone informa 4). O resto vem da medição de fps */
  let floor = 0;
  if (mem > 0 && mem <= 2) floor = 2;
  else if (/intel/i.test(gpu) && /\bU?HD Graphics/i.test(gpu)) floor = 1; // Intel HD/UHD (as Xe/Iris/Arc, não)

  const ms = frameMs();
  /* STACK: 60 fps folgado → lente cheia; o custo do AUDIT na lente 1,0 é
   * da mesma ordem do da STACK (ambos ~5–8 ms numa GPU média) */
  const byStack = ms === null ? 0 : ms <= 19 ? 0 : ms <= 26 ? 1 : ms <= 45 ? 2 : 3;
  const level = Math.max(floor, byStack);
  const info = `${ms === null ? "STACK não mediu (a vigia de fps da cena decide)" : `STACK ${ms.toFixed(1)} ms/quadro`} · ${cores || "?"} núcleos · ${mem ? `${mem} GB` : "memória indefinida"} · ${gpu || "GPU ?"}${floor ? ` · piso ${floor}` : ""}`;
  return { level, why: info };
}
