/*
 * Qualidade do AUDIT sem trabalho extra (nenhum benchmark): reaproveita o
 * que a STACK já mede enquanto roda — o intervalo entre quadros seguidos do
 * loop dela (física + render, com a GPU de verdade) — e usa o aparelho como
 * desempate (núcleos, memória e o nome da GPU).
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
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(gpu)) return { level: 3, why: `GPU por software (${gpu})` };

  /* piso pelo aparelho */
  let floor = 0;
  if (cores <= 2 || mem <= 2) floor = 2;
  else if (/intel/i.test(gpu) && /\bU?HD Graphics/i.test(gpu)) floor = 1; // Intel HD/UHD (as Xe/Iris/Arc, não)
  else if (cores <= 4 && mem <= 4) floor = 1;

  const ms = frameMs();
  /* STACK: 60 fps folgado → lente cheia; o custo do AUDIT na lente 1,0 é
   * da mesma ordem do da STACK (ambos ~5–8 ms numa GPU média) */
  const byStack = ms === null ? 0 : ms <= 19 ? 0 : ms <= 26 ? 1 : ms <= 45 ? 2 : 3;
  const level = Math.max(floor, byStack);
  const info = `${ms === null ? "STACK não mediu" : `STACK ${ms.toFixed(1)} ms/quadro`} · ${cores} núcleos · ${mem} GB · ${gpu || "GPU ?"}`;
  return { level, why: info };
}
