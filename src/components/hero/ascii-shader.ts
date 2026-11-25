import { FIT, GLYPHS, MIN_DENSITY, PLACEHOLDER_ASPECT, RAMP_IDX, RATIO, TOK2_IDX, TOK3_IDX } from "@/lib/ascii/core";

/* Triângulo de tela cheia sem buffers. */
export const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const arr = (name: string, a: number[]) => `const int ${name}[${a.length}] = int[${a.length}](${a.join(",")});`;
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/*
 * Mesma lógica de src/lib/ascii/core.ts (pickGlyph, bustShade), mais o que só
 * existe ao vivo: tremulação com noise, embaralhamento perto do cursor e a
 * lente que mostra a "foto" sem ASCII.
 */
const HEAD = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uRes;
uniform float uCols;
uniform float uTime;
uniform float uDpr;
uniform sampler2D uAtlas;
uniform sampler2D uImg;
uniform bool uHasImg;
uniform float uAspect;
uniform float uImgLod;
uniform vec3 uPtr;   // x, y (px do framebuffer, origem embaixo), atividade 0..1
uniform vec3 uLens;  // x, y, raio
uniform sampler2D uGrid; // glifo base por célula (passe de grade)
out vec4 o;

const float RATIO = ${f(RATIO)};
const float FIT = ${f(FIT)};
const float MIN_D = ${f(MIN_DENSITY)};
const float PH_ASPECT = ${f(PLACEHOLDER_ASPECT)};
const float NG = ${f(GLYPHS.length)};
${arr("RAMP", RAMP_IDX)}
${arr("TOK2", TOK2_IDX)}
${arr("TOK3", TOK3_IDX)}

const vec3 INK = vec3(0.078);
const vec3 AMBER = vec3(0.86, 0.55, 0.08);
const vec3 PAPER = vec3(0.914, 0.906, 0.886);

uint hash3(uint x, uint y, uint z) {
  uint h = (x * 0x8da6b343u) ^ (y * 0xd8163841u) ^ (z * 0xcb1ab31fu);
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return h;
}

float sdE(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
float sdRB(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float bust(vec2 p) {
  float shoulders = sdE(p, vec2(0.5, 0.42));
  float neck = sdRB(p - vec2(0.0, 0.5), vec2(0.09, 0.15), 0.04);
  float head = sdE(p - vec2(0.0, 0.86), vec2(0.22, 0.29));
  return smin(smin(shoulders, neck, 0.05), head, 0.04);
}
vec2 bustShade(vec2 uv) {
  vec2 p = vec2(uv.x - 0.5, uv.y / PH_ASPECT);
  float d = bust(p);
  float e = 0.004;
  vec2 g = vec2(bust(p + vec2(e, 0.0)) - bust(p - vec2(e, 0.0)), bust(p + vec2(0.0, e)) - bust(p - vec2(0.0, e)));
  g = length(g) > 0.0 ? normalize(g) : vec2(0.0);
  float h = sqrt(clamp(-d / 0.14, 0.0, 1.0));
  vec3 n = normalize(vec3(g * (1.0 - h) * 1.3, 1.0));
  float lum = 0.2 + 0.58 * max(dot(n, normalize(vec3(-0.35, 0.45, 0.82))), 0.0);
  float hairLine = 0.99 - 0.05 * cos(p.x * 9.0);
  lum *= 1.0 - 0.7 * smoothstep(hairLine - 0.01, hairLine + 0.02, p.y);
  lum *= 1.0 - 0.3 * (1.0 - smoothstep(0.28, 0.36, p.y));
  lum *= 1.0 - 0.4 * (1.0 - smoothstep(0.52, 0.62, p.y)) * smoothstep(0.36, 0.48, p.y);
  float eye = min(length(vec2((abs(p.x) - 0.08) / 0.05, (p.y - 0.88) / 0.025)), 1.0);
  lum *= 0.5 + 0.5 * smoothstep(0.4, 1.0, eye);
  return vec2(lum, d);
}

`;

const PICK = `
float lumToDensity(float l) { return min(1.0, pow(max(0.0, 1.0 - l), 1.15) * 1.05); }

vec2 cellUV(ivec2 c) {
  return vec2(((float(c.x) + 0.5) / uCols - (1.0 - FIT) * 0.5) / FIT, (float(c.y) + 0.5) * RATIO * uAspect / (FIT * uCols));
}

float dens(ivec2 c) {
  vec2 uv = cellUV(c);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  if (uHasImg) return lumToDensity(dot(textureLod(uImg, uv, uImgLod).rgb, vec3(0.2126, 0.7152, 0.0722)));
  vec2 s = bustShade(uv);
  return s.y < 0.0 ? lumToDensity(s.x) : 0.0;
}

int pick(ivec2 c) {
  float d = dens(c);
  if (d < MIN_D) return 0;
  uint rs = hash3(uint(c.y), 0u, 7u);
  int w = (rs & 1u) == 1u ? 2 : 3;
  int off = int((rs >> 1u) % uint(w));
  int g = (c.x + off) / w;
  int k = (c.x + off) % w;
  uint gh = hash3(uint(g), uint(c.y), 13u);
  if (gh % 100u < 36u) {
    float dc = dens(ivec2(g * w - off + (w >> 1), c.y));
    if (dc > 0.26 && dc < 0.8) {
      int t = int((gh >> 8u) % 8u);
      return w == 2 ? TOK2[t * 2 + k] : TOK3[t * 3 + k];
    }
  }
  int ri = 1 + min(8, int(floor((d - MIN_D) / (1.0 - MIN_D) * 9.0)));
  return RAMP[ri];
}

`;

const NOISE = `
float h21(vec2 p) { return float(hash3(uint(int(p.x) + 20000), uint(int(p.y) + 20000), 5u) & 0xffffu) / 65535.0; }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}

`;

/*
 * Passe de grade: 1 fragmento por célula (~5 mil), refeito no resize e a cada
 * passo da tremulação (6×/s). Saída: r = glifo, g = destaque âmbar.
 */
export const GRID_FRAG = `${HEAD}${PICK}${NOISE}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  int g = pick(c);
  float amber = 0.0;
  /* tremulação: poucas células trocam de glifo, em manchas de noise */
  uint fh = hash3(uint(c.x), uint(c.y), uint(uTime * 6.0) + 977u);
  float nz = vnoise(vec2(c) * vec2(0.09, 0.16) + vec2(uTime * 0.25, -uTime * 0.15));
  if (g != 0 && float(fh % 10000u) * 1e-4 < 0.012 + 0.05 * smoothstep(0.6, 0.95, nz)) {
    g = 1 + int((fh >> 14u) % uint(NG - 1.0));
    amber = ((fh >> 9u) & 7u) == 0u ? 1.0 : 0.0;
  }
  o = vec4(float(g) / 255.0, amber, 0.0, 1.0);
}`;

/* Passe por frame: lê a grade (texelFetch); só o embaralhamento e a lente são por pixel. */
export const FRAG = `${HEAD}
void main() {
  vec2 p = gl_FragCoord.xy;
  float cw = uRes.x / uCols;
  vec2 cell = vec2(cw, cw * RATIO);

  /* embaralhamento: empurra a grade para fora do cursor */
  vec2 dv = p - uPtr.xy;
  float dist = length(dv);
  float s = uPtr.z * pow(1.0 - smoothstep(0.0, 120.0 * uDpr, dist), 2.0);
  vec2 pw = p - (dist > 0.0 ? dv / dist : vec2(0.0)) * s * 12.0 * uDpr;
  vec2 gp = pw / cell;
  /* derivadas fora de qualquer desvio (o uv do atlas salta entre células) */
  vec2 gdx = dFdx(gp), gdy = dFdy(gp);

  ivec2 c = ivec2(floor(gp));
  vec2 fr = fract(gp);
  o = vec4(0.0);

  if (c.x >= 0 && c.y >= 0 && c.x < int(uCols) && c.y < textureSize(uGrid, 0).y) {
    vec4 cv = texelFetch(uGrid, c, 0);
    int g = int(cv.r * 255.0 + 0.5);
    bool amber = cv.g > 0.5;
    if (s > 0.001) {
      uint sh = hash3(uint(c.x), uint(c.y), uint(uTime * 16.0) + 31u);
      if (float(sh % 10000u) * 1e-4 < s * (g == 0 ? 0.3 : 0.85)) {
        g = 1 + int((sh >> 14u) % uint(NG - 1.0));
        amber = ((sh >> 11u) & 1u) == 1u;
      }
    }

    if (g != 0) {
      vec2 auv = vec2((float(g) + fr.x) / NG, 1.0 - fr.y);
      vec2 k = vec2(1.0 / NG, -1.0);
      float a = textureGrad(uAtlas, auv, gdx * k, gdy * k).a;
      a *= amber ? 1.0 : 0.92;
      o = vec4((amber ? AMBER : INK) * a, a);
    }
  }

  /* lente: por trás do código, a foto */
  if (uLens.z > 0.0) {
    float ld = distance(p, uLens.xy);
    float px = uDpr;
    float inside = 1.0 - smoothstep(uLens.z - px, uLens.z, ld);
    o += vec4(0.0, 0.0, 0.0, 0.14) * (1.0 - smoothstep(uLens.z, uLens.z + 22.0 * uDpr, ld)) * (1.0 - inside) * (1.0 - o.a);
    if (inside > 0.0) {
      vec2 uv = vec2((p.x / uRes.x - (1.0 - FIT) * 0.5) / FIT, p.y / (FIT * uRes.x / uAspect));
      vec3 col = PAPER;
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
        if (uHasImg) {
          col = texture(uImg, uv).rgb;
        } else {
          vec2 b = bustShade(uv);
          float edge = 1.5 / (FIT * uRes.x);
          vec3 tone = mix(vec3(0.17, 0.12, 0.09), vec3(0.97, 0.87, 0.75), b.x);
          col = mix(PAPER, tone, 1.0 - smoothstep(-edge, edge, b.y));
        }
      }
      o = mix(o, vec4(col, 1.0), inside);
    }
    float ring = 1.0 - smoothstep(0.0, 1.1 * uDpr, abs(ld - uLens.z));
    o = mix(o, vec4(AMBER, 1.0), ring);
  }
}`;
