/*
 * Núcleo do retrato ASCII, compartilhado por dois consumidores:
 *   - servidor (build): gera o <pre> estático, que é a primeira pintura e o fallback;
 *   - shader (cliente): recebe as mesmas tabelas e repete o mesmo algoritmo em GLSL.
 * Por isso o hash é inteiro (Math.imul ≡ uint em GLSL) e a escolha de glifo é
 * determinística por célula: o canvas entra por cima do <pre> sem "pular".
 *
 * Grade: `cols` colunas fixas por breakpoint; a célula tem altura = RATIO × largura
 * (JetBrains Mono avança 0,6em → line-height 1,08em). Linhas contadas de BAIXO
 * para cima: o busto fica ancorado na base do quadro.
 */

export const RAMP = " .:-=+*#%@";
export const TOKENS2 = ["{}", "=>", "()", "0x", "&&", "[]", "//", "!="];
export const TOKENS3 = ["</>", "=>{", "();", "0xf", "===", "{0}", "[];", "(){"];
const EXTRA = "$|_1";

export const GLYPHS = Array.from(new Set([...(RAMP + TOKENS2.join("") + TOKENS3.join("") + EXTRA)])).join("");
const gi = (ch: string) => GLYPHS.indexOf(ch);
export const RAMP_IDX = [...RAMP].map(gi);
export const TOK2_IDX = TOKENS2.flatMap((t) => [...t].map(gi));
export const TOK3_IDX = TOKENS3.flatMap((t) => [...t].map(gi));

export const RATIO = 1.8;
/* a imagem ocupa 90% da largura do quadro, centralizada e apoiada na base */
export const FIT = 0.9;
export const MIN_DENSITY = 0.07;
export const GRID = { wide: 96, narrow: 60 } as const;
export const PLACEHOLDER_ASPECT = 0.8;

export function hash3(x: number, y: number, z: number) {
  let h = (Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export type Density = (c: number, r: number) => number;

/* Célula → coordenada na imagem (u à direita, v para cima, 0..1). */
export function cellUV(c: number, r: number, cols: number, aspect: number): [number, number] {
  return [((c + 0.5) / cols - (1 - FIT) / 2) / FIT, ((r + 0.5) * RATIO * aspect) / (FIT * cols)];
}

/* Linhas necessárias para cobrir a altura da imagem. */
export const rowsFor = (cols: number, aspect: number) => Math.ceil((FIT * cols) / aspect / RATIO);

export const lumToDensity = (lum: number) => Math.min(1, Math.pow(Math.max(0, 1 - lum), 1.15) * 1.05);

/*
 * Glifo base: rampa de densidade, com trechos da linha trocados por tokens de
 * código (grupos de 2 ou 3 células, conforme a linha) nas densidades médias.
 */
export function pickGlyph(c: number, r: number, dens: Density) {
  const d = dens(c, r);
  if (d < MIN_DENSITY) return 0;
  const rs = hash3(r, 0, 7);
  const w = rs & 1 ? 2 : 3;
  const off = (rs >>> 1) % w;
  const g = Math.floor((c + off) / w);
  const k = (c + off) % w;
  const gh = hash3(g, r, 13);
  if (gh % 100 < 36) {
    const dc = dens(g * w - off + (w >> 1), r);
    if (dc > 0.26 && dc < 0.8) {
      const t = (gh >>> 8) % 8;
      return w === 2 ? TOK2_IDX[t * 2 + k] : TOK3_IDX[t * 3 + k];
    }
  }
  const ri = 1 + Math.min(8, Math.floor(((d - MIN_DENSITY) / (1 - MIN_DENSITY)) * 9));
  return RAMP_IDX[ri];
}

export function renderText(cols: number, rows: number, dens: Density) {
  const lines: string[] = [];
  for (let r = rows - 1; r >= 0; r--) {
    let s = "";
    for (let c = 0; c < cols; c++) s += GLYPHS[pickGlyph(c, r, dens)];
    lines.push(s.trimEnd());
  }
  return lines.join("\n");
}

/* ---------- Placeholder procedural: busto por SDF ----------
 * Espaço q em "larguras": x ∈ [-0.5, 0.5], y ∈ [0, 1/aspect]. O GLSL em
 * ascii-shader.ts repete estas funções linha a linha. */
const len = (x: number, y: number) => Math.hypot(x, y);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const sdE = (x: number, y: number, rx: number, ry: number) => (len(x / rx, y / ry) - 1) * Math.min(rx, ry);
function sdRB(x: number, y: number, bx: number, by: number, rad: number) {
  const qx = Math.abs(x) - bx + rad;
  const qy = Math.abs(y) - by + rad;
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
}
function smin(a: number, b: number, k: number) {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b + (a - b) * h - k * h * (1 - h);
}
function bust(x: number, y: number) {
  const shoulders = sdE(x, y, 0.5, 0.42);
  const neck = sdRB(x, y - 0.5, 0.09, 0.15, 0.04);
  const head = sdE(x, y - 0.86, 0.22, 0.29);
  return smin(smin(shoulders, neck, 0.05), head, 0.04);
}
/* → [luminância 0..1, distância assinada] */
export function bustShade(u: number, v: number): [number, number] {
  const x = u - 0.5;
  const y = v / PLACEHOLDER_ASPECT;
  const d = bust(x, y);
  const e = 0.004;
  let gx = bust(x + e, y) - bust(x - e, y);
  let gy = bust(x, y + e) - bust(x, y - e);
  const gl = len(gx, gy) || 1;
  gx /= gl;
  gy /= gl;
  const h = Math.sqrt(clamp01(-d / 0.14));
  const s = (1 - h) * 1.3;
  const nx = gx * s, ny = gy * s, nl = Math.hypot(nx, ny, 1);
  const L = [-0.35, 0.45, 0.82];
  const Ll = Math.hypot(L[0], L[1], L[2]);
  const diff = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / (nl * Ll));
  let lum = 0.2 + 0.58 * diff;
  const hairLine = 0.99 - 0.05 * Math.cos(x * 9);
  lum *= 1 - 0.7 * smoothstep(hairLine - 0.01, hairLine + 0.02, y);
  lum *= 1 - 0.3 * (1 - smoothstep(0.28, 0.36, y));
  lum *= 1 - 0.4 * (1 - smoothstep(0.52, 0.62, y)) * smoothstep(0.36, 0.48, y);
  const eye = Math.min(len((Math.abs(x) - 0.08) / 0.05, (y - 0.88) / 0.025), 1);
  lum *= 0.5 + 0.5 * smoothstep(0.4, 1, eye);
  return [lum, d];
}

export function placeholderDensity(cols: number): Density {
  return (c, r) => {
    const [u, v] = cellUV(c, r, cols, PLACEHOLDER_ASPECT);
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;
    const [lum, d] = bustShade(u, v);
    return d < 0 ? lumToDensity(lum) : 0;
  };
}
