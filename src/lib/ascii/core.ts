/*
 * Núcleo do retrato ASCII, compartilhado pelo servidor (fallback <pre> gerado
 * no build) e pelo shader (mesmas tabelas e o mesmo algoritmo em GLSL).
 * Hash inteiro (Math.imul ≡ uint em GLSL): a escolha de glifo é determinística
 * por célula.
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

/* célula: altura = RATIO × largura (JetBrains Mono avança 0,6em → line-height 1,08em) */
export const RATIO = 1.8;
export const MIN_DENSITY = 0.08;
/* Retrato centralizado: 70% da altura do hero, limitado a 95% da largura.
 * Celular em pé (largura < 640 e altura > 1,2 × largura): menor (42% da
 * altura), entre FULL-STACK e DEVELOPER. */
export const PORTRAIT_H = 0.7;
export const PORTRAIT_H_NARROW = 0.42;
export const PORTRAIT_MAX_W = 0.95;
export const isNarrow = (W: number, H: number) => W < 640 && H > W * 1.2;
/*
 * Retângulo do retrato: FONTE ÚNICA do posicionamento. O shader (via
 * portraitRect, em px) e as camadas HTML do hero (via portraitBoxStyle, em
 * unidades de container do .hero, com --ph trocado por container query na
 * mesma condição de isNarrow) usam exatamente a mesma conta:
 *   altura = min(ph × altura, 95% da largura / proporção), centralizado.
 */
export function portraitRect(W: number, H: number, aspect: number) {
  const ph = isNarrow(W, H) ? PORTRAIT_H_NARROW : PORTRAIT_H;
  const h = Math.min(ph * H, (PORTRAIT_MAX_W * W) / aspect);
  const w = h * aspect;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
export const portraitBoxStyle = (aspect: number) =>
  ({
    position: "absolute",
    left: "50%",
    top: "50%",
    height: `min(var(--ph, ${PORTRAIT_H}) * 100cqh, ${PORTRAIT_MAX_W * 100}cqw / ${aspect})`,
    aspectRatio: String(aspect),
    translate: "-50% -50%",
  }) as const;
/*
 * Enigma (fundo do hero): à esquerda e atrás do retrato, na faixa entre
 * FULL-STACK e DEVELOPER (centro vertical do hero), sem encostar nas bordas
 * (margem de 2% da largura). No celular, menor e no alto à esquerda (ao lado
 * da cabeça). Mesma regra no shader (enigmaRect, px) e no CSS
 * (.hero-enigma-box, com as mesmas constantes em cqw/cqh):
 *   altura = min(h·H, wMax·W / proporção)
 *   centro = (max(cx·W, 2%·W + largura/2), cy·H)
 * alpha: opacidade dos glifos (sempre abaixo do retrato, que é 100%).
 */
export const ENIGMA = {
  wide: { h: 0.46, wMax: 0.38, cx: 0.19, cy: 0.5, alpha: 0.52 },
  narrow: { h: 0.2, wMax: 0.55, cx: 0.3, cy: 0.4, alpha: 0.35 },
} as const;
export const NARROW = 640;
const EDGE = 0.02;
export function enigmaRect(W: number, H: number, aspect: number) {
  const p = W < NARROW ? ENIGMA.narrow : ENIGMA.wide;
  const h = Math.min(p.h * H, (p.wMax * W) / aspect);
  const w = h * aspect;
  const cx = Math.max(p.cx * W, EDGE * W + w / 2);
  return { x: cx - w / 2, y: p.cy * H - h / 2, w, h, alpha: p.alpha };
}
/*
 * Tom da Enigma: a máquina é quase toda preta, e a curva do retrato a
 * transformaria num bloco denso. Aqui entra contraste LOCAL (luminância
 * menos a média de ~6 células): teclas, lâmpadas e rotores viram vazios
 * claros contra o corpo, que fica em meio-tom; o branco dos níveis sai do
 * percentil 75 (não 97) e a densidade tem teto (`cap`), para a máquina
 * nunca pesar mais que o retrato. Rampa completa, sem tokens de código.
 */
/* grade da Enigma: células com 60% do tamanho das do retrato (mais detalhe
 * na máquina; o retrato, com glifos maiores e cor cheia, segue dominante) */
export const BG_SUB = 0.6;
export const TONE_BG = { sharpen: 1.0, curve: 0.6, gamma: 1.8, local: 0.55, gain: 3.2, cap: 0.9, white: 0.75 } as const;
export function bgGlyph(d: number) {
  if (d < MIN_DENSITY) return 0;
  return RAMP_IDX[1 + Math.min(8, Math.floor(((d - MIN_DENSITY) / (1 - MIN_DENSITY)) * 9))];
}
/* densidade da Enigma: blur = ~3 células (nitidez), big = ~6 células (contraste local) */
export function bgDensity(l: number, blur: number, big: number, u: number, v: number, lv: Levels) {
  const T = TONE_BG;
  let x = l + T.sharpen * (l - blur);
  x = clamp01((x - lv.black) / (lv.white - lv.black));
  x = x + (smoothstep(0, 1, x) - x) * T.curve;
  x = Math.pow(x, T.gamma);
  const loc = clamp01(0.5 + T.gain * (l - big));
  x = x + (loc - x) * T.local;
  const edge = smoothstep(0, 0.04, u) * smoothstep(0, 0.04, 1 - u) * smoothstep(0, 0.04, 1 - v) * smoothstep(0, 0.02, v);
  return Math.min(T.cap, 1 - x) * edge;
}

/* Largura da célula ao vivo, em px CSS: ~W/220, entre 5 e 7. */
export const cellWidth = (w: number) => Math.min(7, Math.max(5, w / 220));
/* Colunas do <pre> estático (fallback), na largura do retrato. */
export const PRE_COLS = 110;

/* Sharpen + curva de contraste; os pontos de preto/branco vêm do histograma da foto (build). */
export const LEVELS = { sharpen: 0.7, curve: 0.5, gamma: 1.35 } as const;
export type Levels = { black: number; white: number };

/* Níveis automáticos: preto no percentil 2, branco no 97 (o fundo branco da foto vira papel). */
export function autoLevels(lum: ArrayLike<number>, hi = 0.97): Levels {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < lum.length; i++) hist[lum[i]]++;
  const at = (q: number) => {
    let acc = 0;
    for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= q * lum.length) return v / 255;
    return 1;
  };
  const black = at(0.02);
  const white = Math.max(black + 0.3, at(hi));
  return { black, white: Math.min(1, white) };
}

export function hash3(x: number, y: number, z: number) {
  let h = (Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* luminância (0..1) + versão borrada → densidade 0..1, com borda suavizada no quadro */
export function toneDensity(l: number, blur: number, u: number, v: number, lv: Levels) {
  let x = l + LEVELS.sharpen * (l - blur);
  x = clamp01((x - lv.black) / (lv.white - lv.black));
  x = x + (smoothstep(0, 1, x) - x) * LEVELS.curve;
  x = Math.pow(x, LEVELS.gamma);
  const edge = smoothstep(0, 0.07, u) * smoothstep(0, 0.07, 1 - u) * smoothstep(0, 0.07, 1 - v) * smoothstep(0, 0.02, v);
  return (1 - x) * edge;
}

export type Density = (c: number, r: number) => number;

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
  if (gh % 100 < 30) {
    const dc = dens(g * w - off + (w >> 1), r);
    if (dc > 0.3 && dc < 0.75) {
      const t = (gh >>> 8) % 8;
      return w === 2 ? TOK2_IDX[t * 2 + k] : TOK3_IDX[t * 3 + k];
    }
  }
  const ri = 1 + Math.min(8, Math.floor(((d - MIN_DENSITY) / (1 - MIN_DENSITY)) * 9));
  return RAMP_IDX[ri];
}

export function renderText(cols: number, rows: number, dens: Density, thin = false) {
  const lines: string[] = [];
  for (let r = rows - 1; r >= 0; r--) {
    let s = "";
    for (let c = 0; c < cols; c++) s += GLYPHS[thin ? bgGlyph(dens(c, r)) : pickGlyph(c, r, dens)];
    lines.push(s.trimEnd());
  }
  return lines.join("\n");
}
