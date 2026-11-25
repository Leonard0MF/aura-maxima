import fs from "node:fs";
import path from "node:path";

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

const PUBLIC = path.join(process.cwd(), "public");

/* Retrato do hero: o primeiro que existir entre public/portrait.png (fundo
 * removido, o ideal: a foto da lente fica limpa sobre o escuro),
 * public/portrait.jpg e public/portrait-test.jpg (TODO: foto do Léo). */
export function getPortrait() {
  const name = ["portrait.png", "portrait.jpg"].find((f) => fs.existsSync(path.join(PUBLIC, f))) ?? "portrait-test.jpg";
  return getAsciiImage(name);
}

const cache = new Map<string, Promise<AsciiImageData>>();
export function getAsciiImage(name: string) {
  let p = cache.get(name);
  if (!p) cache.set(name, (p = build(name.replace(/^\//, ""))));
  return p;
}

async function build(name: string): Promise<AsciiImageData> {
  const { default: sharp } = await import("sharp");
  const W = 256;
  const { data, info } = await sharp(path.join(PUBLIC, name))
    .resize({ width: W })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const aspect = info.width / info.height;
  const levels = autoLevels(data);

  const at = (x: number, y: number) =>
    data[Math.min(info.height - 1, Math.max(0, Math.round(y))) * info.width + Math.min(info.width - 1, Math.max(0, Math.round(x)))] / 255;
  const rows = Math.ceil(PRE_COLS / aspect / RATIO);
  const cellPx = info.width / PRE_COLS;

  const text = renderText(PRE_COLS, rows, (c, r) => {
    const u = (c + 0.5) / PRE_COLS;
    const v = (r + 0.5) / rows;
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const x = u * info.width;
    const y = (1 - v) * info.height;
    const l = at(x, y);
    const k = cellPx * 2;
    const blur = (at(x - k, y) + at(x + k, y) + at(x, y - k) + at(x, y + k)) / 4;
    return toneDensity(l, blur, u, v, levels);
  });

  const mask = await figureMask(sharp, path.join(PUBLIC, name), data, info.width, info.height);

  return {
    mask,
    src: `/_next/image?url=${encodeURIComponent(`/${name}`)}&w=1080&q=75`,
    aspect,
    svg: toSvg(text, rows),
    levels,
  };
}

/*
 * Máscara da figura: o fundo é o que é claro E está ligado às bordas da imagem
 * (preenchimento a partir da borda), somado ao que já é transparente no
 * arquivo (portrait.png com o fundo removido). Bordas suavizadas com blur.
 */
async function figureMask(sharp: typeof import("sharp").default, file: string, grey: Buffer, w: number, h: number) {
  const { data: alpha } = await sharp(file).resize({ width: w }).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const BG = 222; // "claro o bastante para ser fundo"
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (i: number) => {
    if (!bg[i] && (grey[i] >= BG || alpha[i] < 16)) {
      bg[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) seed(x), seed((h - 1) * w + x);
  for (let y = 0; y < h; y++) seed(y * w), seed(y * w + w - 1);
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
  for (let i = 0; i < w * h; i++) (ga[2 * i] = 255), (ga[2 * i + 1] = soft[i]);
  const png = await sharp(ga, { raw: { width: w, height: h, channels: 2 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/* Texto → SVG monoespaçado (célula 6 × 10,8; mesma proporção da grade ao vivo). */
function toSvg(text: string, rows: number) {
  const fs = 10;
  const lh = fs * RATIO * 0.6;
  const width = Math.round(PRE_COLS * fs * 0.6);
  const height = Math.round(rows * lh);
  const esc = (l: string) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = text
    .split("\n")
    .map((l, i) => (l.trim() ? `<text y="${((i + 0.85) * lh).toFixed(1)}">${esc(l)}</text>` : ""))
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="${fs}" fill="#141414" xml:space="preserve">` +
    lines +
    `</svg>`;
  return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, width, height };
}
