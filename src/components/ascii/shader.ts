import { BG_SUB, GLYPHS, LEVELS, MIN_DENSITY, RAMP_IDX, RATIO, TONE_BG, TOK2_IDX, TOK3_IDX } from "@/lib/ascii/core";

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
uniform float uDpr;
uniform float uAspect;
uniform float uImgLod;
uniform vec2 uLevels;  // preto, branco (níveis automáticos do build)
uniform sampler2D uAtlas;
uniform sampler2D uImg;
uniform sampler2D uGrid;
uniform vec3 uPtr;     // x, y, atividade 0..1
uniform float uAccent; // 1 = destaques em âmbar; 0 = só tinta (blocos com inversão de cor)
uniform float uKnock;  // 1 = o rosto cobre a tipografia; 0 = desenha por cima (telas estreitas)
/* Enigma (fundo): segunda imagem, mesma grade, atrás do retrato */
uniform sampler2D uImg2;
uniform vec4 uRect2;   // x0, y0, w, h (px, origem embaixo)
uniform vec2 uLevels2;
uniform float uImg2Lod;
uniform float uHas2;   // 0 = sem Enigma (imagem não carregou)
uniform float uAlpha2; // opacidade dos glifos da Enigma (~0.3; 0.2 no celular)
out vec4 o;

const float RATIO = ${f(RATIO)};
const float MIN_D = ${f(MIN_DENSITY)};
const float NG = ${f(GLYPHS.length)};
${arr("RAMP", RAMP_IDX)}
${arr("TOK2", TOK2_IDX)}
${arr("TOK3", TOK3_IDX)}

const vec3 INK = vec3(0.078);
const vec3 AMBER = vec3(0.80, 0.50, 0.06);
const vec3 PAPER = vec3(0.914, 0.906, 0.886);

uint hash3(uint x, uint y, uint z) {
  uint h = (x * 0x8da6b343u) ^ (y * 0xd8163841u) ^ (z * 0xcb1ab31fu);
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return h;
}
`;

const COMMON = `
/* uImg tem alpha PRÉ-multiplicado (subido assim de propósito: o mipmap faz
 * a média certa na borda da silhueta). "Sobre branco" = rgb + (1 - a):
 * transparente vira claro (vazio), nunca preto (glifo denso). */
float lumOf(sampler2D img, vec2 uv, float lod) {
  vec4 t = textureLod(img, uv, lod);
  return dot(t.rgb + (1.0 - t.a), vec3(0.2126, 0.7152, 0.0722));
}
/* Enigma: bgDensity / bgGlyph de core.ts (contraste local, rampa completa),
 * numa grade própria mais fina (BG_SUB × a célula do retrato), calculada
 * por pixel no passe de frame. */
float densBg(vec2 uv, float lod) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  if (textureLod(uImg2, uv, lod).a < 0.5) return 0.0;
  float l = lumOf(uImg2, uv, lod);
  float big = 0.5 * (lumOf(uImg2, uv, lod + 2.6) + l);
  float x = l + ${f(TONE_BG.sharpen)} * (l - lumOf(uImg2, uv, lod + 1.6));
  x = clamp((x - uLevels2.x) / (uLevels2.y - uLevels2.x), 0.0, 1.0);
  x = mix(x, smoothstep(0.0, 1.0, x), ${f(TONE_BG.curve)});
  x = pow(x, ${f(TONE_BG.gamma)});
  x = mix(x, clamp(0.5 + ${f(TONE_BG.gain)} * (l - big), 0.0, 1.0), ${f(TONE_BG.local)});
  float edge = smoothstep(0.0, 0.04, uv.x) * smoothstep(0.0, 0.04, 1.0 - uv.x) * smoothstep(0.0, 0.04, 1.0 - uv.y) * smoothstep(0.0, 0.02, uv.y);
  return min(${f(TONE_BG.cap)}, 1.0 - x) * edge;
}
int pickBg(float d) {
  if (d < MIN_D) return 0;
  return RAMP[1 + min(8, int(floor((d - MIN_D) / (1.0 - MIN_D) * 9.0)))];
}
`;

/* Mesma lógica de toneDensity / pickGlyph em src/lib/ascii/core.ts. */
const GRID = `
vec2 cellUV(ivec2 c) {
  vec2 p = (vec2(c) + 0.5) * vec2(uCell, uCell * RATIO);
  return (p - uRect.xy) / uRect.zw;
}
float alphaAt(vec2 uv) { return textureLod(uImg, uv, uImgLod).a; }
/* toneDensity de core.ts para qualquer uma das duas imagens */
float densOf(sampler2D img, vec2 uv, float lod, vec2 lv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  if (textureLod(img, uv, lod).a < 0.5) return 0.0; // fora da silhueta: célula vazia
  float l = lumOf(img, uv, lod);
  float x = l + ${f(LEVELS.sharpen)} * (l - lumOf(img, uv, lod + 2.0));
  x = clamp((x - lv.x) / (lv.y - lv.x), 0.0, 1.0);
  x = mix(x, smoothstep(0.0, 1.0, x), ${f(LEVELS.curve)});
  x = pow(x, ${f(LEVELS.gamma)});
  float edge = smoothstep(0.0, 0.07, uv.x) * smoothstep(0.0, 0.07, 1.0 - uv.x) * smoothstep(0.0, 0.07, 1.0 - uv.y) * smoothstep(0.0, 0.02, uv.y);
  return (1.0 - x) * edge;
}
float dens(ivec2 c) { return densOf(uImg, cellUV(c), uImgLod, uLevels); }
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
 * Saída: r = glifo, g = máscara (0 = fora da silhueta, 0.5 = dentro, 1 = dentro
 * e em âmbar), b = célula opaca (cobre a tipografia), a = densidade.
 */
export const GRID_FRAG = `${HEAD}${COMMON}${GRID}
void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 uv = cellUV(c);
  bool inRect = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
  bool inMask = inRect && alphaAt(uv) >= 0.5;
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

  if (!inMask) g = 0;
  o = vec4(float(g) / 255.0, inMask ? (amber > 0.5 ? 1.0 : 0.5) : 0.0, inMask ? solid : 0.0, d);
}`;

/*
 * Passe por frame: lê a grade; só o efeito do cursor é por pixel.
 * Efeito do cursor (só dentro da silhueta): a grade desliza no máximo ~1
 * célula para longe do ponteiro e alguns glifos trocam. Pixel cuja célula
 * está fora da máscara não desenha nada, e o deslocamento nunca traz um
 * glifo de fora para dentro nem de dentro para fora.
 */
export const FRAG = `${HEAD}${COMMON}
void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 cell = vec2(uCell, uCell * RATIO);

  vec2 dv = p - uPtr.xy;
  float dist = length(dv);
  float s = uPtr.z * pow(1.0 - smoothstep(0.0, 110.0 * uDpr, dist), 2.0);
  vec2 pw = p - (dist > 0.0 ? dv / dist : vec2(0.0)) * s * uCell;
  vec2 gp = pw / cell;
  /* derivadas antes de qualquer desvio (o uv do atlas salta entre células) */
  vec2 gdx = dFdx(gp), gdy = dFdy(gp);
  o = vec4(0.0);

  ivec2 gs = textureSize(uGrid, 0);
  ivec2 c0 = ivec2(floor(p / cell));
  if (c0.x < 0 || c0.y < 0 || c0.x >= gs.x || c0.y >= gs.y) return;
  vec4 c0v = texelFetch(uGrid, c0, 0);
  /* fora do retrato: a Enigma, numa grade mais fina, em tinta, com opacidade
   * abaixo do retrato e parada (sem cursor nem tremulação). O retrato,
   * quando existe na célula, fica sempre por cima. */
  if (c0v.g < 0.25) {
    if (uHas2 < 0.5 || uAlpha2 <= 0.0) return;
    vec2 cellE = cell * ${f(BG_SUB)};
    vec2 pe = p / cellE;
    vec2 ce = floor(pe);
    vec2 uv2 = ((ce + 0.5) * cellE - uRect2.xy) / uRect2.zw;
    if (uv2.x < 0.0 || uv2.x > 1.0 || uv2.y < 0.0 || uv2.y > 1.0) return;
    float de = densBg(uv2, uImg2Lod + ${f(Math.log2(BG_SUB))});
    int ge = pickBg(de);
    if (ge == 0) return;
    vec2 fe = fract(pe);
    vec2 euv = vec2((float(ge) + fe.x) / NG, 1.0 - fe.y);
    vec2 ke = vec2(1.0 / NG, -1.0);
    float ae = textureGrad(uAtlas, euv, dFdx(pe) * ke, dFdy(pe) * ke).a * uAlpha2 * mix(0.55, 1.0, smoothstep(MIN_D, 0.8, de));
    o = vec4(INK * ae, ae);
    return;
  }

  ivec2 c = ivec2(floor(gp));
  vec2 fr = fract(gp);
  if (c.x < 0 || c.y < 0 || c.x >= gs.x || c.y >= gs.y || texelFetch(uGrid, c, 0).g < 0.25) {
    c = c0;
    fr = fract(p / cell);
  }
  vec4 cv = texelFetch(uGrid, c, 0);
  int g = int(cv.r * 255.0 + 0.5);
  bool amber = cv.g > 0.75;
  float solid = cv.b * uKnock;
  float d = cv.a;
  if (s > 0.001 && g != 0) {
    uint sh = hash3(uint(c.x), uint(c.y), uint(uTime * 12.0) + 31u);
    if (float(sh % 10000u) * 1e-4 < s * 0.6) {
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
}`;


/*
 * Intro "descriptografia" (só na 1ª carga da sessão): cada glifo do retrato
 * e da Enigma é um quad instanciado (1 instância por célula, nenhum DOM).
 * Cada célula tem a própria origem aleatória no hero e o próprio progresso:
 *   0–0,3 s   campo esparso: ~22% dos glifos piscando na origem
 *   0,2–1,4 s voo até a célula certa, easing expo-out, com atraso pela
 *             distância ao centro do rosto; trava no glifo certo ao chegar
 * uFly está sempre na escala do desktop (o celular comprime o tempo antes).
 */
export const INTRO_VS = `${HEAD.replace("out vec4 o;\n", "")}${COMMON}
uniform float uFly;
uniform int uCols;
uniform int uMode;     // 0 = retrato (lê a grade), 1 = Enigma (grade fina, densBg)
uniform vec2 uE0;      // Enigma: primeira célula da grade fina (em células)
uniform vec2 uFace;    // centro do rosto (px do framebuffer, origem embaixo)
flat out int vG;
flat out float vA;
flat out float vAmber;
out vec2 vUV;
void main() {
  ivec2 c = ivec2(gl_InstanceID % uCols, gl_InstanceID / uCols);
  vec2 cellSz = vec2(uCell, uCell * RATIO);
  vec2 target;
  int g;
  float a;
  float amber = 0.0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // descartado
  if (uMode == 0) {
    vec4 cv = texelFetch(uGrid, c, 0);
    if (cv.g < 0.25) return;
    g = int(cv.r * 255.0 + 0.5);
    if (g == 0) return;
    amber = cv.g > 0.75 ? 1.0 : 0.0;
    a = mix(0.42, 1.0, smoothstep(MIN_D, 0.85, cv.a));
    target = vec2(c) * cellSz;
  } else {
    cellSz *= ${f(BG_SUB)};
    vec2 ce = vec2(c) + uE0;
    vec2 uv2 = ((ce + 0.5) * cellSz - uRect2.xy) / uRect2.zw;
    float d = densBg(uv2, uImg2Lod + ${f(Math.log2(BG_SUB))});
    g = pickBg(d);
    if (g == 0) return;
    a = uAlpha2 * mix(0.55, 1.0, smoothstep(MIN_D, 0.8, d));
    target = ce * cellSz;
  }
  uint h = hash3(uint(c.x), uint(c.y), uint(uMode) + 101u);
  vec2 org = vec2(float(h & 0xffffu), float(h >> 16u)) / 65535.0 * uRes;
  float dist = clamp(length(target - uFace) / uRes.y / 0.9, 0.0, 1.0);
  float start = 0.2 + 0.5 * dist + float((h >> 7u) % 100u) * 5e-4;
  float p = clamp((uFly - start) / 0.6, 0.0, 1.0);
  float e = p >= 1.0 ? 1.0 : 1.0 - exp2(-10.0 * p);
  vec2 pos = mix(org, target, e);
  float vis = 1.0;
  if (p < 1.0) {
    /* em voo (ou ainda na origem): glifo aleatório piscando */
    uint fh = hash3(uint(c.x), uint(c.y), uint(uFly * 14.0) + uint(uMode) * 977u);
    g = 1 + int((fh >> 8u) % uint(NG - 1.0));
    amber = (fh & 7u) == 0u ? 1.0 : 0.0;
    float spark = (fh % 100u) < 22u ? 0.75 : 0.0; // campo esparso
    vis = max(spark * smoothstep(0.0, 0.08, uFly), smoothstep(0.0, 0.12, p));
    a = max(a, 0.6);
  }
  vA = a * vis;
  if (vA <= 0.001) return;
  vG = g;
  vAmber = amber;
  int k = gl_VertexID;
  vec2 q = vec2((k == 1 || k == 2 || k == 4) ? 1.0 : 0.0, (k == 2 || k == 4 || k == 5) ? 1.0 : 0.0);
  vUV = q;
  gl_Position = vec4((pos + q * cellSz) / uRes * 2.0 - 1.0, 0.0, 1.0);
}`;

export const INTRO_FS = `${HEAD}
flat in int vG;
flat in float vA;
flat in float vAmber;
in vec2 vUV;
void main() {
  float a = texture(uAtlas, vec2((float(vG) + vUV.x) / NG, 1.0 - vUV.y)).a * vA;
  o = vec4(mix(INK, AMBER, vAmber * uAccent) * a, a);
}`;
