/*
 * Painel de diagnóstico para aparelho real: ?debug na URL (?auditdebug também
 * liga, por compatibilidade).
 *
 * Mostra na tela (dá para tirar print no celular, sem depuração remota):
 *  - aparelho: WebGL2/WebGL1, GPU, devicePixelRatio, hardwareConcurrency,
 *    deviceMemory (o Safari não informa: "indefinido"), prefers-reduced-motion,
 *    pointer: coarse e se localStorage/sessionStorage funcionam;
 *  - cada seção (hero, stack, audit): o modo/qualidade escolhido e o MOTIVO de
 *    qualquer fallback.
 * Sem o parâmetro: nada na tela (no dev, só o console).
 */
type Section = "hero" | "stack" | "audit";
const data: Record<Section, Record<string, string>> = { hero: {}, stack: {}, audit: {} };
let panel: HTMLPreElement | null = null;
let device = "";

export const debugOn = () => typeof location !== "undefined" && /[?&](debug|auditdebug)\b/.test(location.search);

function storageOk(kind: "localStorage" | "sessionStorage") {
  try {
    const s = window[kind];
    const k = "__diag";
    s.setItem(k, "1");
    s.removeItem(k);
    return "ok";
  } catch (e) {
    return `falha (${(e as Error)?.name || "erro"})`;
  }
}

function deviceInfo() {
  const lose = (gl: WebGLRenderingContext | WebGL2RenderingContext | null) => gl?.getExtension("WEBGL_lose_context")?.loseContext();
  let gl2 = false, gl1 = false, gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (gl) {
      gl2 = true;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
    }
    lose(gl);
  } catch {
    /* sem WebGL2 */
  }
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    gl1 = !!gl;
    if (!gpu && gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
    }
    lose(gl);
  } catch {
    /* sem WebGL */
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  const mq = (q: string) => (matchMedia(q).matches ? "sim" : "não");
  const html = document.documentElement.dataset;
  return [
    `WebGL2 ${gl2 ? "sim" : "não"} · WebGL1 ${gl1 ? "sim" : "não"}`,
    `GPU: ${gpu || "?"}`,
    `devicePixelRatio ${window.devicePixelRatio || 1} · hardwareConcurrency ${navigator.hardwareConcurrency ?? "indefinido"} · deviceMemory ${nav.deviceMemory ?? "indefinido"}`,
    `prefers-reduced-motion ${mq("(prefers-reduced-motion: reduce)")} · pointer: coarse ${mq("(pointer: coarse)")}`,
    `localStorage ${storageOk("localStorage")} · sessionStorage ${storageOk("sessionStorage")}`,
    `boot: fx=${html.fx ?? "—"} · intro=${html.intro ?? "—"} (${html.introWhy ?? "—"})`,
  ].join("\n");
}

function render() {
  if (!panel) {
    panel = document.createElement("pre");
    panel.setAttribute("aria-hidden", "true");
    panel.dataset.diag = "";
    panel.style.cssText =
      "position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;max-height:50vh;overflow:auto;margin:0;padding:8px 10px;background:rgb(0 0 0/.88);color:#f5a524;font:10px/1.45 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;border:1px solid #f5a524;pointer-events:none";
    document.body.appendChild(panel);
  }
  if (!device) device = deviceInfo();
  const block = (s: Section) =>
    Object.keys(data[s]).length
      ? `\n[${s}]\n` + Object.entries(data[s]).map(([k, v]) => `  ${k}: ${v}`).join("\n")
      : `\n[${s}] —`;
  panel.textContent = `[aparelho]\n${device}` + (["hero", "stack", "audit"] as Section[]).map(block).join("");
}

/** registra um dado de uma seção (console no dev ou com ?debug; painel com ?debug) */
export function report(section: Section, key: string, value: unknown) {
  const v = typeof value === "string" ? value : JSON.stringify(value);
  data[section][key] = v;
  const on = debugOn();
  if (on || process.env.NODE_ENV !== "production") console.info(`[${section}] ${key}: ${v}`);
  if (on && typeof document !== "undefined" && document.body) render();
}

/** abre o painel só com os dados do aparelho (chamado no carregamento) */
export function showDiag() {
  if (debugOn() && document.body) render();
}
