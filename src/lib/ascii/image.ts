import path from "node:path";

import { portrait } from "@/content/portrait";

import { PRE_COLS, RATIO, autoLevels, renderText, toneDensity, type Levels } from "./core";

/*
 * Roda só no build (a home é SSG). Converte uma imagem de public/ em: URL
 * otimizada (textura do shader), proporção, níveis automáticos e o fallback
 * estático em SVG (reduced-motion, sem WebGL, sem JS, blocos fora da tela).
 */
export type AsciiImageData = {
  src: string;
  aspect: number;
  /** fallback estático: SVG (data URI) com o texto ASCII, servido como <img> */
  svg: { src: string; width: number; height: number };
  levels: Levels;
  /** máscara de alfa da figura (PNG data URI, ~1–3 KB): recorta o fundo claro
   * da foto da lente para nenhum retângulo aparecer sobre o escuro */
  mask: string;
};

/* Retrato (src/content/portrait.ts, fonte única). `cols`: colunas do
 * fallback em SVG (o hero usa PRE_COLS; o ABOUT, menor, usa menos). */
const cache = new Map<number, Promise<AsciiImageData>>();
export function getPortrait(cols = PRE_COLS) {
  let p = cache.get(cols);
  if (!p) cache.set(cols, (p = build(cols)));
  return p;
}

async function build(cols: number): Promise<AsciiImageData> {
  const { default: sharp } = await import("sharp");
  const W = 256;
  const file = path.join(process.cwd(), portrait.file);
  /* luminância com o retrato composto sobre branco: pixel transparente vira
   * claro (célula vazia), nunca preto (glifo denso) */
  const { data, info } = await sharp(file)
    .resize({ width: W })
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: alpha } = await sharp(file).resize({ width: W }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const hasAlpha = (await sharp(file).metadata()).hasAlpha === true;
  const aspect = info.width / info.height;
  /* níveis só sobre a figura (o fundo transparente não conta no histograma) */
  const levels = autoLevels(hasAlpha ? data.filter((_, i) => alpha[i] >= 128) : data);

  const idx = (x: number, y: number) =>
    Math.min(info.height - 1, Math.max(0, Math.round(y))) * info.width + Math.min(info.width - 1, Math.max(0, Math.round(x)));
  const at = (x: number, y: number) => data[idx(x, y)] / 255;
  const rows = Math.ceil(cols / aspect / RATIO);
  const cellPx = info.width / cols;

  const text = renderText(cols, rows, (c, r) => {
    const u = (c + 0.5) / cols;
    const v = (r + 0.5) / rows;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const x = u * info.width;
    const y = (1 - v) * info.height;
    if (alpha[idx(x, y)] < 128) return 0; // alpha < 0.5: célula vazia
    const l = at(x, y);
    const k = cellPx * 2;
    const blur = (at(x - k, y) + at(x + k, y) + at(x, y - k) + at(x, y + k)) / 4;
    return toneDensity(l, blur, u, v, levels);
  });

  const mask = await figureMask(sharp, data, alpha, hasAlpha, info.width, info.height);

  return {
    mask,
    /* a URL com hash do import estático, otimizada: a MESMA para a textura
     * do shader, a foto da lente e o ABOUT (uma só requisição, em cache) */
    src: `/_next/image?url=${encodeURIComponent(portrait.photo.src)}&w=1080&q=75`,
    aspect,
    svg: toSvg(text, cols, rows),
    levels,
  };
}

/*
 * Máscara da figura (recorta o fundo da foto dentro da lente).
 * - PNG com fundo removido: a máscara É o alpha do arquivo (nada de
 *   adivinhação: a camisa branca encostada na borda continua na foto).
 * - foto com fundo (JPG): o fundo é o que é claro E está ligado às bordas
 *   (preenchimento a partir da borda).
 * Bordas suavizadas com blur.
 */
async function figureMask(sharp: typeof import("sharp").default, grey: Buffer, alpha: Buffer, hasAlpha: boolean, w: number, h: number) {
  const BG = 222; // "claro o bastante para ser fundo"
  const bg = new Uint8Array(w * h);
  if (hasAlpha) for (let i = 0; i < w * h; i++) bg[i] = alpha[i] < 128 ? 1 : 0;
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!bg[i] && (grey[i] >= BG || alpha[i] < 16)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w && !hasAlpha; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h && !hasAlpha; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (i >= w) seed(i - w);
    if (i < w * (h - 1)) seed(i + w);
  }
  const m = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) m[i] = bg[i] || alpha[i] < 16 ? 0 : 255;
  /* mask-image usa o ALFA: branco + alfa = máscara (suavizada) */
  const soft = await sharp(m, { raw: { width: w, height: h, channels: 1 } }).blur(1.2).extractChannel(0).raw().toBuffer();
  const ga = Buffer.alloc(w * h * 2);
  for (let i = 0; i < w * h; i++) {
    ga[2 * i] = 255;
    ga[2 * i + 1] = soft[i];
  }
  const png = await sharp(ga, { raw: { width: w, height: h, channels: 2 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/* Texto → SVG monoespaçado (célula 6 × 10,8; mesma proporção da grade ao vivo). */
function toSvg(text: string, cols: number, rows: number) {
  const fs = 10;
  const lh = fs * RATIO * 0.6;
  const width = Math.round(cols * fs * 0.6);
  const height = Math.round(rows * lh);
  const esc = (l: string) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text
    .split("\n")
    /* espaços iniciais viram x (o SVG colapsa espaço em branco no começo da
     * linha, e com o fundo transparente cada linha começa com espaços) */
    .map((l, i) => {
      const body = l.trimStart();
      if (!body.trim()) return "";
      const x = ((l.length - body.length) * fs * 0.6).toFixed(1);
      return `<text x="${x}" y="${((i + 0.85) * lh).toFixed(1)}">${esc(body.trimEnd())}</text>`;
    })
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="${fs}" fill="#141414" xml:space="preserve">` +
    lines +
    `</svg>`;
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, width, height };
}
