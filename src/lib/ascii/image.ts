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
};

const PUBLIC = path.join(process.cwd(), "public");

/* Retrato do hero: public/portrait.jpg; enquanto ele não existir,
 * public/portrait-test.jpg (TODO: trocar pela foto do Léo, fundo removido). */
export function getPortrait() {
  return getAsciiImage(fs.existsSync(path.join(PUBLIC, "portrait.jpg")) ? "portrait.jpg" : "portrait-test.jpg");
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

  return {
    src: `/_next/image?url=${encodeURIComponent(`/${name}`)}&w=1080&q=75`,
    aspect,
    svg: toSvg(text, rows),
    levels,
  };
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
