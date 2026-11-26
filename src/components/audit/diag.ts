/*
 * Diagnóstico da constelação (para depurar em aparelho real).
 *
 * Com ?auditdebug na URL: cada dado vai para o console ("[audit] chave: valor")
 * e para um painel fixo na tela (dá para tirar print no celular, mesmo sem
 * depuração remota). No dev, só o console. Em produção sem o parâmetro, nada.
 *
 * O que registra: WebGL2/WebGL1, KHR_parallel_shader_compile,
 * Worker/OffscreenCanvas/requestIdleCallback, núcleos, memória, GPU, nº de
 * partículas, onde o layout foi gerado, nível de qualidade, erros de shader,
 * perdas de contexto, tamanho do campo e o motivo de qualquer fallback.
 */
const data: Record<string, string> = {};
let panel: HTMLPreElement | null = null;

export const auditDebug = () => typeof location !== "undefined" && location.search.includes("auditdebug");

export function note(key: string, value: unknown) {
  const v = typeof value === "string" ? value : JSON.stringify(value);
  data[key] = v;
  const debug = auditDebug();
  if (debug || process.env.NODE_ENV !== "production") console.info(`[audit] ${key}: ${v}`);
  if (!debug) return;
  if (!panel) {
    panel = document.createElement("pre");
    panel.setAttribute("aria-hidden", "true");
    panel.style.cssText =
      "position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;max-height:45vh;overflow:auto;margin:0;padding:8px 10px;background:rgb(0 0 0/.85);color:#f5a524;font:10px/1.45 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;border:1px solid #f5a524;pointer-events:none";
    document.body.appendChild(panel);
  }
  panel.textContent = Object.entries(data)
    .map(([k, x]) => `${k}: ${x}`)
    .join("\n");
}

/** suporte do aparelho (uma vez; os contextos de teste são liberados na hora) */
export function probe() {
  const lose = (gl: WebGLRenderingContext | WebGL2RenderingContext | null) => gl?.getExtension("WEBGL_lose_context")?.loseContext();
  let webgl2 = false;
  let webgl1 = false;
  let khr = false;
  let gpu = "";
  let maxPoint = 0;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl) {
      webgl2 = true;
      khr = !!gl.getExtension("KHR_parallel_shader_compile");
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
      maxPoint = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)?.[1] ?? 0;
    }
    lose(gl);
  } catch {
    /* sem WebGL2 */
  }
  if (!webgl2) {
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      webgl1 = !!gl;
      lose(gl);
    } catch {
      /* sem WebGL */
    }
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const info = {
    webgl2,
    webgl1: webgl2 || webgl1,
    khr,
    worker: typeof Worker !== "undefined",
    offscreen: typeof OffscreenCanvas !== "undefined",
    idle: "requestIdleCallback" in window,
    cores: navigator.hardwareConcurrency || 0,
    mem: nav.deviceMemory ?? 0,
    gpu,
    maxPoint,
  };
  note("suporte", `WebGL2 ${webgl2 ? "sim" : "não"} · WebGL1 ${info.webgl1 ? "sim" : "não"} · KHR_parallel_shader_compile ${khr ? "sim" : "não (compila síncrono, em idle)"} · Worker ${info.worker ? "sim" : "não"} · OffscreenCanvas ${info.offscreen ? "sim" : "não"} · requestIdleCallback ${info.idle ? "sim" : "não"}`);
  note("aparelho", `${info.cores || "?"} núcleos · ${info.mem || "?"} GB · GPU ${gpu || "?"} · ponto máx. ${maxPoint || "?"} px`);
  return info;
}
