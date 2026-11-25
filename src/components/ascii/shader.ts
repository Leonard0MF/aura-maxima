import { GLYPHS, LEVELS, MIN_DENSITY, RAMP_IDX, RATIO, TOK2_IDX, TOK3_IDX } from "@/lib/ascii/core";

/* Triângulo de tela cheia sem buffers. */
export const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const arr = (name: string, a: number[]) => `const int ${name}[${a.length}] = int[${a.length}](${a.join(",")});`;
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

const HEAD = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uRes;     // framebuffer (px)
uniform float uCell;   // largura da célula (px do framebuffer)
uniform vec4 uRect;    // retrato: x0, y0, w, h (px, origem embaixo)
uniform float uTime;
uniform float uIntro;  // segundos desde o início da montagem (>= 2 = pronta)
uniform float uDpr;
uniform float uAspect;
uniform float uImgLod;
uniform vec2 uLevels;  // preto, branco (níveis automáticos do build)
uniform sampler2D uAtlas;
uniform sampler2D uImg;
uniform sampler2D uGrid;
uniform vec3 uPtr;     // x, y, atividade 0..1
uniform vec3 uLens;    // x, y, raio
uniform float uAccent; // 1 = destaques em âmbar; 0 = só tinta (blocos com inversão de cor)
uniform float uKnock;  // 1 = o rosto cobre a tipografia; 0 = desenha por cima (telas estreitas)
out vec4 o;

const float RATIO = ${f(RATIO)};
const float MIN_D = ${f(MIN_DENSITY)};
const float NG = ${f(GLYPHS.length)};
${arr("RAMP", RAMP_IDX)}
${arr("TOK2", TOK2_IDX)}
${arr("TOK3", TOK3_IDX)}

const vec3 INK = vec3(0.078);
const vec3 AMBER = vec3(0.80, 0.50, 0.06);
const vec3 RING = vec3(0.96, 0.65, 0.14);
const vec3 PAPER = vec3(0.914, 0.906, 0.886);

uint hash3(uint x, uint y, uint z) {
  uint h = (x * 0x8da6b343u) ^ (y * 0xd8163841u) ^ (z * 0xcb1ab31fu);
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return h;
}
`;

/* Mesma lógica de toneDensity / pickGlyph em src/lib/ascii/core.ts. */
const GRID = `
vec2 cellUV(ivec2 c) {
  vec2 p = (vec2(c) + 0.5) * vec2(uCell, uCell * RATIO);
  return (p - uRect.xy) / uRect.zw;
}
float lum(vec2 uv, float lod) { return dot(textureLod(uImg, uv, lod).rgb, vec3(0.2126, 0.7152, 0.0722)); }
float dens(ivec2 c) {
  vec2 uv = cellUV(c);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  float l = lum(uv, uImgLod);
  float x = l + ${f(LEVELS.sharpen)} * (l - lum(uv, uImgLod + 2.0));
  x = clamp((x - uLevels.x) / (uLevels.y - uLevels.x), 0.0, 1.0);
  x = mix(x, smoothstep(0.0, 1.0, x), ${f(LEVELS.curve)});
  x = pow(x, ${f(LEVELS.gamma)});
  float edge = smoothstep(0.0, 0.07, uv.x) * smoothstep(0.0, 0.07, 1.0 - uv.x) * smoothstep(0.0, 0.07, 1.0 - uv.y) * smoothstep(0.0, 0.02, uv.y);
  return (1.0 - x) * edge;
}
int pick(ivec2 c, float d) {
  if (d < MIN_D) return 0;
  uint rs = hash3(uint(c.y), 0u, 7u);
  int w = (rs & 1u) == 1u ? 2 : 3;
  int off = int((rs >> 1u) % uint(w));
  int g = (c.x + off) / w;
  int k = (c.x + off) % w;
  uint gh = hash3(uint(g), uint(c.y), 13u);
  if (gh % 100u < 30u) {
    float dc = dens(ivec2(g * w - off + (w >> 1), c.y));
    if (dc > 0.3 && dc < 0.75) {
      int t = int((gh >> 8u) % 8u);
      return w == 2 ? TOK2[t * 2 + k] : TOK3[t * 3 + k];
    }
  }
  int ri = 1 + min(8, int(floor((d - MIN_D) / (1.0 - MIN_D) * 9.0)));
  return RAMP[ri];
}
float h21(vec2 p) { return float(hash3(uint(int(p.x) + 20000), uint(int(p.y) + 20000), 5u) & 0xffffu) / 65535.0; }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
`;

/*
 * Passe de grade: 1 fragmento por célula, refeito no resize, a cada frame da
 * montagem e depois a cada passo da tremulação (6×/s).
 * Saída: r = glifo, g = âmbar forçado, b = célula opaca (cobre a tipografia), a = densidade.
 */
export const GRID_FRAG = `${HEAD}${GRID}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 uv = cellUV(c);
  bool inRect = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
  float d = dens(c);
  int g = pick(c, d);
  float amber = 0.0;
  float solid = smoothstep(0.3, 0.5, d);

  /* tremulação: poucas células trocam de glifo, em manchas de noise */
  uint fh = hash3(uint(c.x), uint(c.y), uint(uTime * 6.0) + 977u);
  float nz = vnoise(vec2(c) * vec2(0.06, 0.11) + vec2(uTime * 0.25, -uTime * 0.15));
  if (g != 0 && float(fh % 10000u) * 1e-4 < 0.01 + 0.04 * smoothstep(0.6, 0.95, nz)) {
    g = 1 + int((fh >> 14u) % uint(NG - 1.0));
    amber = ((fh >> 9u) & 7u) == 0u ? 1.0 : 0.0;
  }

  /* montagem: glifos aleatórios que travam no certo, de dentro para fora */
  if (inRect && uIntro < 2.0) {
    float dc = length((uv - vec2(0.5, 0.55)) * vec2(uAspect, 1.0)) / 0.7;
    float lockAt = 0.12 + 1.1 * dc + float(hash3(uint(c.x), uint(c.y), 3u) % 1000u) * 2.5e-4;
    if (uIntro < lockAt) {
      uint rh = hash3(uint(c.x), uint(c.y), uint(uIntro * 24.0) + 71u);
      g = rh % 4u == 0u ? 0 : 1 + int((rh >> 8u) % uint(NG - 1.0));
      amber = ((rh >> 4u) & 7u) == 0u ? 1.0 : 0.0;
      d = 0.4;
      solid = 0.0;
    }
  }
  o = vec4(float(g) / 255.0, amber, solid, d);
}`;

/* Passe por frame: lê a grade; só embaralhamento e lente são por pixel. */
export const FRAG = `${HEAD}
void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 cell = vec2(uCell, uCell * RATIO);

  /* embaralhamento: empurra a grade para fora do cursor */
  vec2 dv = p - uPtr.xy;
  float dist = length(dv);
  float s = uPtr.z * pow(1.0 - smoothstep(0.0, 120.0 * uDpr, dist), 2.0);
  vec2 pw = p - (dist > 0.0 ? dv / dist : vec2(0.0)) * s * 10.0 * uDpr;
  vec2 gp = pw / cell;
  /* derivadas fora de qualquer desvio (o uv do atlas salta entre células) */
  vec2 gdx = dFdx(gp), gdy = dFdy(gp);

  ivec2 c = ivec2(floor(gp));
  vec2 fr = fract(gp);
  ivec2 gs = textureSize(uGrid, 0);
  o = vec4(0.0);

  if (c.x >= 0 && c.y >= 0 && c.x < gs.x && c.y < gs.y) {
    vec4 cv = texelFetch(uGrid, c, 0);
    int g = int(cv.r * 255.0 + 0.5);
    bool amber = cv.g > 0.5;
    float solid = cv.b * uKnock;
    float d = cv.a;
    if (s > 0.001) {
      uint sh = hash3(uint(c.x), uint(c.y), uint(uTime * 16.0) + 31u);
      if (float(sh % 10000u) * 1e-4 < s * (g == 0 ? 0.25 : 0.85)) {
        g = 1 + int((sh >> 14u) % uint(NG - 1.0));
        amber = ((sh >> 11u) & 3u) == 0u;
      }
    }
    o = vec4(PAPER, 1.0) * solid;
    if (g != 0) {
      vec2 auv = vec2((float(g) + fr.x) / NG, 1.0 - fr.y);
      vec2 k = vec2(1.0 / NG, -1.0);
      /* opacidade modulada pela densidade: gradação tonal além do glifo */
      float a = textureGrad(uAtlas, auv, gdx * k, gdy * k).a * mix(0.42, 1.0, smoothstep(MIN_D, 0.85, d));
      /* destaques (áreas mais claras do rosto) em âmbar sutil */
      float hi = (amber ? 1.0 : smoothstep(0.32, 0.12, d) * 0.8 * solid) * uAccent;
      vec3 col = mix(INK, AMBER, hi);
      o = o * (1.0 - a) + vec4(col * a, a);
    }
  }

  /* lente: por trás do código, a foto */
  if (uLens.z > 0.0) {
    float ld = distance(p, uLens.xy);
    float inside = 1.0 - smoothstep(uLens.z - uDpr, uLens.z, ld);
    o += vec4(0.0, 0.0, 0.0, 0.16) * (1.0 - smoothstep(uLens.z, uLens.z + 24.0 * uDpr, ld)) * (1.0 - inside) * (1.0 - o.a);
    if (inside > 0.0) {
      vec2 uv = (p - uRect.xy) / uRect.zw;
      vec3 col = vec3(0.05, 0.055, 0.07);
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) col = texture(uImg, uv).rgb * PAPER;
      o = mix(o, vec4(col, 1.0), inside);
    }
    float ring = 1.0 - smoothstep(0.0, 1.1 * uDpr, abs(ld - uLens.z));
    o = mix(o, vec4(RING, 1.0), ring);
  }
}`;
