/*
 * Diagnóstico da constelação (para depurar em aparelho real).
 *
 * Com ?debug (ou ?auditdebug) na URL: cada dado vai para o console
 * ("[audit] chave: valor") e para o painel geral de lib/diag. No dev, só o
 * console. Em produção sem o parâmetro, nada.
 *
 * O que registra: WebGL2/WebGL1, KHR_parallel_shader_compile,
 * Worker/OffscreenCanvas/requestIdleCallback, núcleos, memória, GPU, nº de
 * partículas, onde o layout foi gerado, nível de qualidade, erros de shader,
 * perdas de contexto, tamanho do campo e o motivo de qualquer fallback.
 */
import { debugOn, report } from "@/lib/diag";

export const auditDebug = debugOn;

/** vai para o painel geral (lib/diag, seção "audit") */
export function note(key: string, value: unknown) {
  report("audit", key, value);
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
