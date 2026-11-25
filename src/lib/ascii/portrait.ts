import fs from "node:fs";
import path from "node:path";

import {
  GRID,
  PLACEHOLDER_ASPECT,
  cellUV,
  lumToDensity,
  placeholderDensity,
  renderText,
  rowsFor,
  type Density,
} from "./core";

/*
 * Roda só no build (a home é SSG). Se existir public/portrait.jpg, lê a
 * luminância com sharp (já vem com o Next); senão usa o busto procedural.
 * Resultado: o texto ASCII dos dois breakpoints, que vira o <pre> estático
 * (primeira pintura + fallback sem WebGL / reduced-motion).
 */
export type PortraitData = {
  /** null = placeholder procedural */
  src: string | null;
  aspect: number;
  wide: string;
  narrow: string;
};

const FILE = path.join(process.cwd(), "public", "portrait.jpg");
/* Mesmo arquivo servido pelo otimizador de imagem (largura permitida por padrão). */
const OPTIMIZED = "/_next/image?url=%2Fportrait.jpg&w=1080&q=75";

async function imageDensity(): Promise<{ aspect: number; dens: (cols: number) => Density } | null> {
  if (!fs.existsSync(FILE)) return null;
  const { default: sharp } = await import("sharp");
  const W = 256;
  const { data, info } = await sharp(FILE).resize({ width: W }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const aspect = info.width / info.height;
  const at = (x: number, y: number) => data[Math.min(info.height - 1, Math.max(0, y)) * info.width + Math.min(info.width - 1, Math.max(0, x))] / 255;
  const sample = (u: number, v: number) => {
    /* bilinear; v = 0 é a base da imagem */
    const x = u * info.width - 0.5;
    const y = (1 - v) * info.height - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return a * (1 - fy) + b * fy;
  };
  return {
    aspect,
    dens: (cols) => (c, r) => {
      const [u, v] = cellUV(c, r, cols, aspect);
      if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
      return lumToDensity(sample(u, v));
    },
  };
}

export async function getPortrait(): Promise<PortraitData> {
  const img = await imageDensity();
  const aspect = img?.aspect ?? PLACEHOLDER_ASPECT;
  const dens = img?.dens ?? placeholderDensity;
  const text = (cols: number) => renderText(cols, rowsFor(cols, aspect), dens(cols));
  return { src: img ? OPTIMIZED : null, aspect, wide: text(GRID.wide), narrow: text(GRID.narrow) };
}
