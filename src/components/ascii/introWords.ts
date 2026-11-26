import { GLYPHS, RAMP, RATIO } from "@/lib/ascii/core";

/*
 * Intro "descriptografia" das palavras FULL-STACK / DEVELOPER, num canvas 2D
 * POR CIMA do texto real (que está pintado desde o 1º frame: é o LCP; aqui
 * ele só fica coberto por papel). Tempo `u` na escala do desktop:
 *   0,5–0,62 s  blocos de glifos embaralhados no formato das letras
 *               (a forma da palavra, rasterizada com a fonte real, é a máscara)
 *   0,72–1,3 s  trava letra por letra no glifo certo (densidade da letra)
 *   1,22–1,6 s  varredura da esquerda para a direita: o papel sai e a
 *               palavra "solidifica" na fonte display preta
 */
type Cell = { x: number; y: number; d: number; l: number };
type Word = { x: number; y: number; w: number; h: number; n: number; cells: Cell[] };

const PAD = 6;
export const WORDS_END = 1.6;

export function createIntroWords(box: HTMLElement, family: string, coarse: boolean) {
  const canvas = document.createElement("canvas");
  canvas.className = "hero-intro-words";
  canvas.setAttribute("aria-hidden", "true");
  box.insertBefore(canvas, box.querySelector(".ascii-canvas"));
  const ctx = canvas.getContext("2d")!;
  let words: Word[] = [];
  let cw = 6, ch = 6 * RATIO, dpr = 1;
  let atlas: HTMLCanvasElement | null = null;
  const ink = getComputedStyle(box).color || "#141414";
  const paper = getComputedStyle(box).backgroundColor || "#e9e7e2";

  function setup() {
    const W = box.clientWidth, H = box.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    /* grade das palavras: a mesma célula do retrato; no celular, maior (menos glifos) */
    cw = Math.min(7, Math.max(5, W / 220)) * (coarse ? 1.6 : 1);
    ch = cw * RATIO;
    /* atlas dos glifos em tinta, já no tamanho da célula */
    atlas = document.createElement("canvas");
    atlas.width = Math.ceil(cw * dpr) * GLYPHS.length;
    atlas.height = Math.ceil(ch * dpr);
    const a = atlas.getContext("2d")!;
    const tw = Math.ceil(cw * dpr);
    const fontPx = tw / 0.6;
    a.font = `500 ${fontPx}px ${family}`;
    a.fillStyle = ink;
    a.textAlign = "center";
    a.textBaseline = "alphabetic";
    [...GLYPHS].forEach((g, i) => a.fillText(g, i * tw + tw / 2, fontPx * 0.9));

    const br = box.getBoundingClientRect();
    const rg = document.createRange();
    words = [...box.querySelectorAll<HTMLElement>(".hero-layer--surface .hl")].flatMap((el) => {
      const tn = el.firstChild;
      if (!tn || tn.nodeType !== Node.TEXT_NODE) return [];
      const text = tn.textContent ?? "";
      rg.selectNodeContents(tn);
      const r = rg.getBoundingClientRect();
      const w = Math.ceil(r.width), h = Math.ceil(r.height);
      if (w < 4 || h < 4) return [];
      /* máscara: a palavra com a fonte e o espaçamento reais */
      const cs = getComputedStyle(el);
      const m = document.createElement("canvas");
      m.width = w;
      m.height = h;
      const mc = m.getContext("2d", { willReadFrequently: true })!;
      mc.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in mc) (mc as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      mc.textBaseline = "alphabetic";
      const tm = mc.measureText(text);
      const asc = tm.fontBoundingBoxAscent, desc = tm.fontBoundingBoxDescent;
      mc.fillText(text, 0, (h - (asc + desc)) / 2 + asc);
      const px = mc.getImageData(0, 0, w, h).data;
      const cov = (x: number, y: number) => {
        let s = 0;
        for (let j = 0; j < 3; j++)
          for (let i = 0; i < 3; i++) {
            const sx = Math.min(w - 1, Math.max(0, Math.round(x + ((i + 0.5) / 3) * cw)));
            const sy = Math.min(h - 1, Math.max(0, Math.round(y + ((j + 0.5) / 3) * ch)));
            s += px[(sy * w + sx) * 4 + 3];
          }
        return s / (9 * 255);
      };
      /* letra de cada coluna: bordas direitas medidas por Range */
      const rights: number[] = [];
      for (let i = 0; i < text.length; i++) {
        rg.setStart(tn, i);
        rg.setEnd(tn, i + 1);
        rights.push(rg.getBoundingClientRect().right - r.left);
      }
      const cells: Cell[] = [];
      for (let y = 0; y < h; y += ch)
        for (let x = 0; x < w; x += cw) {
          const d = cov(x, y);
          if (d < 0.3) continue;
          const cx = x + cw / 2;
          let l = rights.findIndex((rr) => cx < rr);
          if (l < 0) l = text.length - 1;
          cells.push({ x, y, d, l });
        }
      return [{ x: r.left - br.left, y: r.top - br.top, w, h, n: text.length, cells }];
    });
  }

  const ramp = [...RAMP].map((c) => GLYPHS.indexOf(c));
  const lockGlyph = (d: number) => ramp[Math.min(9, 4 + Math.floor(((d - 0.3) / 0.7) * 5.99))];
  const hash = (a: number, b: number) => {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };

  /** desenha o instante `u`; devolve false quando acabou (papel todo fora) */
  function draw(u: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (u >= WORDS_END || !atlas) return false;
    const tw = Math.ceil(cw * dpr), th = Math.ceil(ch * dpr);
    const step = Math.floor(u * 18);
    words.forEach((w, wi) => {
      const fade = Math.min(1, Math.max(0, (u - 0.5 - wi * 0.06) / 0.12));
      const lockA = 0.72 + wi * 0.08, lockB = lockA + 0.5;
      const sw0 = 1.22 + wi * 0.08, sw1 = sw0 + 0.3;
      const sp = Math.min(1, Math.max(0, (u - sw0) / (sw1 - sw0)));
      const e = sp < 0.5 ? 2 * sp * sp : 1 - (-2 * sp + 2) ** 2 / 2;
      const band = Math.max(40, w.w * 0.08);
      const sx = w.x - band + (w.w + 2 * band + PAD) * e; // borda da varredura
      /* papel sobre a palavra real, com borda suave na varredura */
      const x0 = Math.max(w.x - PAD, sx - band), x1 = w.x + w.w + PAD;
      if (x1 > x0) {
        if (sp > 0) {
          const g = ctx.createLinearGradient(sx - band, 0, sx, 0);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(1, paper);
          ctx.fillStyle = g;
          ctx.fillRect(x0, w.y - PAD, Math.min(sx, x1) - x0, w.h + 2 * PAD);
        }
        ctx.fillStyle = paper;
        const s0 = Math.max(x0, sx);
        if (x1 > s0) ctx.fillRect(s0, w.y - PAD, x1 - s0, w.h + 2 * PAD);
      }
      if (fade <= 0) return;
      for (let i = 0; i < w.cells.length; i++) {
        const c = w.cells[i];
        const cx = w.x + c.x;
        const edge = sp > 0 ? Math.min(1, Math.max(0, (cx - (sx - band)) / band)) : 1;
        if (edge <= 0) continue;
        const locked = u >= lockA + ((lockB - lockA) * c.l) / Math.max(1, w.n - 1);
        const g = locked ? lockGlyph(c.d) : 1 + (hash(i + wi * 9973, step) % (GLYPHS.length - 1));
        ctx.globalAlpha = fade * edge * (locked ? 1 : 0.78);
        ctx.drawImage(atlas!, g * tw, 0, tw, th, cx, w.y + c.y, cw, ch);
      }
      ctx.globalAlpha = 1;
    });
    return true;
  }

  return {
    setup,
    draw,
    destroy: () => canvas.remove(),
  };
}
