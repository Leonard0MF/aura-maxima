/*
 * AUDIT: constelação + buraco negro (three.js). Carregado só quando a seção é
 * a dona do WebGL (lib/gl-slot), via import dinâmico. Um único contexto, um
 * único canvas.
 *
 * A constelação é a nuvem 3D ORIGINAL (#5): nós, linhas e partículas fixos
 * no espaço da própria nuvem (layout.ts), girando JUNTOS como um corpo só
 * (um Group com um quaternion). O pivô é sempre o centróide da nuvem e não
 * há translação acumulada: a posição do grupo só muda no resize. A esfera
 * envolvente é escalada para caber na área segura (layout.fitSphere), então
 * QUALQUER rotação fica dentro dela, sem limite de ângulo.
 *
 * Giro (desktop): arrastar gira em qualquer direção (trackball), 1:1 com o
 * mouse; ao soltar, inércia (×0,92 por quadro de 60 Hz) e fica onde parou.
 * Depois de 6 s sem interação, volta a girar sozinha, devagar. Celular: sem
 * arraste (a página rola), só a rotação automática.
 *
 * Render (qualidade "lens"):
 *   1. a cena (poeira, linhas, nós) vai para um render target
 *   2. um pass em tela cheia faz a lente gravitacional em screen-space e, num
 *      círculo em volta do buraco negro, um raymarch das geodésicas da luz
 *      (horizonte, disco de acreção com Doppler e anel de fótons)
 * Qualidade "simple" (celular, máquinas fracas): sem render target nem lente;
 * o mesmo disco/anel/horizonte desenhados analiticamente por cima da cena.
 *
 * Preparação: a cena nasce PARADA, cedo (AuditField, em idle depois do
 * hero); warm() compila os shaders em paralelo (compileAsync) e desenha um
 * quadro fora da tela, em pedaços (requestIdleCallback). As posições chegam
 * prontas (layout.worker). Qualidade: choose() (lib/gpu-perf), uma vez por
 * sessão; depois de visível só desce (fps < 40 por > 2 s → um degrau).
 *
 * Por frame a CPU só integra a rotação e as molas do cursor e projeta os
 * ~10 nós (hover/cartão): as partículas nunca são reescritas.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  HalfFloatType,
  LineBasicMaterial,
  LineSegments,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";

import { glCensus } from "@/lib/gl-census";
import { pickLevel } from "@/lib/gpu-perf";

import { CAMERA_Z, DISK_RS, FOV, KEEP_PAD, SAFE, STAR_FAR, STAR_NEAR, fitSphere, makeLayout, placeCloud, type Fit, type Layout, type Rect } from "./layout";

const MAX_NODES = 12;
/* raio da sombra em rs (≈ 2,6 rs: 3√3/2) */
const SHADOW = 2.6;

/* camada 1: campo de estrelas. Posição 3D montada aqui com o aspecto atual
 * (x, y em NDC × distância): cobre a seção inteira em qualquer tamanho.
 * Parallax: um deslocamento fixo em unidades de cena vira, na tela, um
 * deslocamento ∝ 1 / distância — as próximas se movem mais. Não gira. */
const STAR_VS = /* glsl */ `
attribute vec4 aStar;   // x, y (NDC), distância até a câmera, semente
uniform float uTime;
uniform float uPR;
uniform float uAspect;
uniform float uTan;     // tan(fov / 2)
uniform vec2 uPar;      // parallax (cursor suavizado, -1..1)
uniform vec2 uRes2;
uniform vec4 uKeep[4];
varying float vA;
varying float vTone;
void main() {
  float d = aStar.z;
  vec3 p = vec3(aStar.x * uAspect * uTan * d, aStar.y * uTan * d, ${CAMERA_Z.toFixed(1)} - d);
  p.xy += uPar * 0.16;
  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_Position = clip;
  vec2 ndc = clip.xy / clip.w;
  vec2 px = vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * uRes2;
  /* atrás dos textos: bem mais apagadas */
  float k = 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 b = uKeep[i];
    float dk = max(max(b.x - px.x, px.x - b.z), max(b.y - px.y, px.y - b.w));
    k = min(k, mix(0.3, 1.0, smoothstep(0.0, 24.0, dk)));
  }
  float far = clamp((d - ${STAR_NEAR.toFixed(1)}) / ${(STAR_FAR - STAR_NEAR).toFixed(1)}, 0.0, 1.0);
  float tw = 0.7 + 0.3 * sin(uTime * (0.8 + aStar.w * 1.6) + aStar.w * 60.0);
  float size = (0.7 + 1.6 * pow(fract(aStar.w * 7.31), 4.0)) * uPR * 9.0 / d;
  /* menores que 1 px: ficam com 1 px e apagam na mesma proporção */
  vA = mix(0.7, 0.14, far) * tw * k * min(1.0, size);
  vTone = step(0.9, fract(aStar.w * 13.7));
  gl_PointSize = max(1.0, size);
}`;

const STAR_FS = /* glsl */ `
uniform vec3 uWhite;
uniform vec3 uAmber;
varying float vA;
varying float vTone;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, r);
  gl_FragColor = vec4(mix(uWhite, uAmber, vTone), a * vA);
}`;

/* camada 2, partículas da rede: posições fixas no espaço da nuvem (o Group gira); deriva,
 * empurrão do cursor e onda de scan no vertex shader */
const DUST_VS = /* glsl */ `
attribute float aSeed;
attribute float aTone;
attribute float aSize;
uniform float uTime;
uniform float uPR;
uniform float uAspect;
uniform float uPush;
uniform float uScale;
uniform vec2 uRes2;     // tamanho do campo (px CSS)
uniform vec4 uHole;     // xy: centro do buraco negro (px, origem em cima), zw: raio da sombra (px)
uniform float uDepthR;  // raio da esfera da rede (mundo): 0 = fundo, 1 = frente
uniform vec4 uKeep[4];  // caixas de texto (px: x0, y0, x1, y1, já com folga)
uniform vec2 uMouse;
uniform vec3 uWave;     // xy: centro (NDC), z: raio
uniform float uWaveA;
varying float vA;
varying float vTone;
varying float vGlow;
void main() {
  vec3 p = position;
  /* profundidade dentro da rede: as de trás menores e mais apagadas */
  float dep = clamp(0.5 + 0.5 * (${CAMERA_Z.toFixed(1)} + (modelViewMatrix * vec4(p, 1.0)).z) / uDepthR, 0.0, 1.0);
  float t = uTime * 0.25 + aSeed * 6.2831;
  p += vec3(sin(t * 1.3), cos(t * 1.1), sin(t * 0.7)) * 0.035;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;

  // cursor: as partículas se afastam (a mola fica na CPU, em uMouse/uPush)
  vec2 d = ndc - uMouse;
  d.x *= uAspect;
  float dist = length(d);
  float push = uPush * exp(-dist * dist / 0.035);
  vec2 dir = d / max(dist, 1e-4);
  dir.x /= uAspect;
  ndc += dir * push * 0.16;

  // onda de scan: anel que sai do horizonte
  vec2 dw = ndc - uWave.xy;
  dw.x *= uAspect;
  float ring = abs(length(dw) - uWave.z);
  float glow = uWaveA * exp(-ring * ring / 0.0025);

  clip.xy = ndc * clip.w;
  gl_Position = clip;

  /* segurança extra (a esfera já cabe na área segura): nada sobre a sombra
   * nem sobre os textos, nem empurrado pelo cursor para cima deles */
  vec2 px = vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * uRes2;
  float fade = smoothstep(1.0, 1.2, length((px - uHole.xy) / uHole.zw));
  for (int k = 0; k < 4; k++) {
    vec4 b = uKeep[k];
    float dk = max(max(b.x - px.x, px.x - b.z), max(b.y - px.y, px.y - b.w));
    fade *= smoothstep(0.0, 10.0, dk);
  }
  float tw = 0.75 + 0.25 * sin(uTime * 1.7 + aSeed * 40.0);
  vA = ((0.36 + 0.24 * aTone) * tw + abs(push) * 0.5) * fade * mix(0.3, 1.0, dep);
  vTone = aTone;
  vGlow = glow * fade;
  gl_PointSize = aSize * uPR * uScale * (1.0 + glow * 1.8) * mix(0.7, 1.0, dep) / -mv.z;
}`;

const DUST_FS = /* glsl */ `
uniform vec3 uWhite;
uniform vec3 uAmber;
varying float vA;
varying float vTone;
varying float vGlow;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, r);
  vec3 c = mix(uWhite, uAmber, vTone);
  c = mix(c, uAmber, min(vGlow, 1.0));
  gl_FragColor = vec4(c, a * min(1.0, vA + vGlow));
}`;

const NODE_VS = /* glsl */ `
attribute float aIndex;
uniform float uTime;
uniform float uPR;
uniform float uLit[${MAX_NODES}];
uniform float uHover;
uniform float uDepthR;
varying float vLit;
varying float vHover;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  /* 0 = fundo, 1 = frente (só no celular; no desktop sempre 1) */
  vDepth = uDepthR > 0.0 ? clamp(0.5 + 0.5 * (${CAMERA_Z.toFixed(1)} + mv.z) / uDepthR, 0.0, 1.0) : 1.0;
  gl_Position = projectionMatrix * mv;
  int i = int(aIndex + 0.5);
  float lit = 0.0;
  for (int k = 0; k < ${MAX_NODES}; k++) if (k == i) lit = uLit[k];
  float hov = abs(aIndex - uHover) < 0.5 ? 1.0 : 0.0;
  float pulse = 0.9 + 0.1 * sin(uTime * 2.2 + aIndex * 1.7);
  vLit = lit;
  vHover = hov;
  gl_PointSize = uPR * (26.0 + 10.0 * lit + 14.0 * hov) * pulse * (${CAMERA_Z.toFixed(1)} / -mv.z) * mix(0.62, 1.0, max(vDepth, hov));
}`;

const NODE_FS = /* glsl */ `
uniform vec3 uWhite;
uniform vec3 uAmber;
varying float vLit;
varying float vHover;
varying float vDepth;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float halo = smoothstep(0.5, 0.0, r) * (0.28 + 0.3 * vLit + 0.25 * vHover);
  float core = smoothstep(0.13, 0.05, r);
  float ring = smoothstep(0.035, 0.0, abs(r - 0.21)) * (0.35 + 0.65 * max(vLit, vHover));
  vec3 c = mix(uAmber, uWhite, core * 0.7);
  gl_FragColor = vec4(c, min(1.0, halo + core + ring) * mix(0.3, 1.0, max(vDepth, max(vLit, vHover))));
}`;

/* ---------- buraco negro ---------- */
const BH_COMMON = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uBH;      // centro em px do drawing buffer (origem embaixo)
uniform float uScale;  // px por rs
uniform float uTime;
uniform float uIncl;   // elevação da câmera sobre o plano do disco (rad)
uniform float uRoll;   // giro do disco no plano da tela (rad): acompanha o arrasto
vec2 roll(vec2 p) { float c = cos(uRoll), s = sin(uRoll); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }
uniform vec3 uWhite;
uniform vec3 uAmber;
const float RIN = 2.6;
const float ROUT = 9.0;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
/* emissão do disco no raio rh, ângulo phi; cosT = cos(velocidade do gás, direção do fóton até a câmera) */
vec3 disk(float rh, float phi, float cosT, out float alpha) {
  float a = phi - uTime * 1.6 * pow(rh, -1.5);           // rotação diferencial
  vec2 q = vec2(cos(a), sin(a));
  float n = 0.55 * vnoise(q * 2.2 + vec2(rh * 2.9, rh * 1.3)) + 0.45 * vnoise(q * 6.0 + vec2(rh * 7.1, 3.0));
  float temp = pow(RIN / rh, 0.85);
  float edge = smoothstep(RIN, RIN + 0.5, rh) * smoothstep(ROUT, ROUT - 4.0, rh);
  float beta = min(0.62, sqrt(0.5 / max(rh - 1.0, 0.4)));
  float g = sqrt(1.0 - beta * beta) / (1.0 - beta * cosT);  // Doppler relativístico simples
  float boost = clamp(g * g * g, 0.12, 4.0);
  float red = sqrt(max(0.0, 1.0 - 1.0 / rh));             // desvio gravitacional
  float I = (0.3 + 0.95 * n) * temp * edge * boost * red * 1.5;
  vec3 c = mix(uAmber, uWhite, clamp(temp * 0.9 + (g - 1.0) * 1.2, 0.0, 1.0));
  alpha = clamp(I * 0.85, 0.0, 0.95);
  return c * I;
}`;

const LENS_FS = /* glsl */ `
${BH_COMMON}
uniform sampler2D tScene;
uniform vec2 uCursor;  // px
uniform float uCM;     // "massa" do cursor (rs²)
uniform float uE2;     // raio de Einstein² da lente fina (rs²)
uniform vec3 uBg;
const float D = 30.0;
const float RMARCH = 11.5;
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 p = (frag - uBH) / uScale;
  float r = length(p);
  // lente fina (partículas curvadas em volta do buraco negro e do cursor)
  vec2 src = p - uE2 * p / max(r * r, 0.25);
  vec2 dc = (frag - uCursor) / uScale;
  src -= uCM * dc / max(dot(dc, dc), 0.4);
  vec3 bg = texture2D(tScene, (uBH + src * uScale) / uRes).rgb;
  vec3 col = uBg + bg;
  if (r < RMARCH) {
    float si = sin(uIncl), ci = cos(uIncl);
    vec3 cam = vec3(0.0, si, ci) * D;
    vec3 fwd = -normalize(cam);
    vec3 up = vec3(0.0, ci, -si);
    vec2 pr = roll(p);
    vec3 dir = normalize(fwd + (pr.x * vec3(1.0, 0.0, 0.0) + pr.y * up) / D);
    // linha reta até a esfera de raio 15 (fora dela a curvatura é desprezível)
    float b = dot(cam, dir);
    float tt = -b - sqrt(max(0.0, b * b - (dot(cam, cam) - 225.0)));
    vec3 pos = cam + dir * tt;
    vec3 vel = dir;
    vec3 hv = cross(pos, vel);
    float h2 = dot(hv, hv);
    vec3 emit = vec3(0.0);
    float T = 1.0;
    bool captured = false;
    for (int k = 0; k < 90; k++) {
      float rr = length(pos);
      float dt = clamp(0.07 * rr, 0.02, 0.7);
      // geodésica nula de Schwarzschild (rs = 1): a = -1,5·h²·r̂/r⁴
      vel += -1.5 * h2 * pos / pow(rr, 5.0) * dt;
      vec3 prev = pos;
      pos += vel * dt;
      if (prev.y * pos.y < 0.0) {
        vec3 hit = mix(prev, pos, prev.y / (prev.y - pos.y));
        float rh = length(hit.xz);
        if (rh > RIN && rh < ROUT) {
          vec3 gas = normalize(vec3(-hit.z, 0.0, hit.x));
          float a;
          vec3 c = disk(rh, atan(hit.z, hit.x), dot(gas, -normalize(vel)), a);
          emit += T * c;
          T *= 1.0 - a;
        }
      }
      float r2 = length(pos);
      if (r2 < 1.0) { captured = true; break; }
      if (r2 > 15.5 && dot(pos, vel) > 0.0) break;
      if (T < 0.02) break;
    }
    // anel de fótons pelo parâmetro de impacto (crítico: 3√3/2 ≈ 2,598): suave, sem serrilhado
    float ring = captured ? 0.0 : exp(-pow((sqrt(h2) - 2.66) / 0.07, 2.0));
    col = (captured ? vec3(0.0) : col) * T + emit + uWhite * ring * 0.7 * T;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const SIMPLE_FS = /* glsl */ `
${BH_COMMON}
void main() {
  vec2 p = roll((gl_FragCoord.xy - uBH) / uScale);
  float r = length(p);
  float si = max(0.08, sin(uIncl));
  vec3 col = vec3(0.0);
  float A = 0.0;
  // atrás: a imagem curvada da parte de trás do disco, em arco sobre o horizonte
  if (p.y > 0.0) {
    float rhb = (r - ${SHADOW.toFixed(1)}) * 1.25 + RIN;
    if (r > ${SHADOW.toFixed(1)} && rhb < ROUT) {
      float a;
      vec3 c = disk(rhb, atan(p.y, p.x) * 2.0, p.x / max(r, 1e-3) * 0.45, a);
      col = c * 0.75;
      A = a * 0.75;
    }
  }
  // horizonte: disco preto perfeito
  float sh = smoothstep(${SHADOW.toFixed(1)} + 0.04, ${SHADOW.toFixed(1)} - 0.04, r);
  col *= 1.0 - sh;
  A = max(A, sh);
  // anel de fótons: quente e colado ao horizonte (cinza puro lia como um círculo solto)
  float ring = exp(-pow((r - ${SHADOW.toFixed(1)} - 0.05) / 0.06, 2.0));
  col += mix(uAmber, uWhite, 0.6) * ring * 0.9;
  A = max(A, ring * 0.8);
  // frente: a metade de baixo do disco, por cima de tudo
  float rh = length(vec2(p.x, p.y / si));
  if (p.y < 0.0 && rh > RIN && rh < ROUT) {
    float a;
    vec3 c = disk(rh, atan(-p.y / si, p.x), p.x / rh * 0.45, a);
    col = col * (1.0 - a) + c;
    A = A + a * (1.0 - A);
  }
  gl_FragColor = vec4(col, A);
}`;

const POST_VS = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

type Quality = "lens-1" | "lens-0.75" | "lens-0.5" | "simple";
const LADDER: Quality[] = ["lens-1", "lens-0.75", "lens-0.5", "simple"];
/* nível escolhido: vale para a sessão (a cena pode ser liberada e recriada) */
let chosen: { level: number; why: string } | null = null;

export type Constellation = {
  run(on: boolean): void;
  /** cursor em px do campo; inside=false solta o empurrão da poeira */
  pointer(x: number, y: number, inside: boolean): void;
  /** o ponto (px do campo) está sobre a nuvem? (onde o arraste começa) */
  inArea(x: number, y: number): boolean;
  /** arraste (desktop): começo, deslocamento em px (1:1, sem atraso) e fim */
  grab(): void;
  dragBy(dx: number, dy: number): void;
  release(): void;
  hit(x: number, y: number): number;
  nodeAt(i: number): { x: number; y: number };
  hover(i: number): void;
  /** compila os shaders e desenha um quadro fora da tela, em pedaços ociosos */
  warm(): Promise<void>;
  /** escolhe o nível (uma vez por sessão; ajusta o buffer e desenha um quadro nele) */
  choose(): { quality: string; why: string };
  /** onda de scan saindo do horizonte; acende os nós na ordem em que o anel os alcança */
  wave(onLit: (i: number) => void, onEnd: () => void): void;
  /** caixas de texto por cima do campo (px do campo): a nuvem não as invade */
  setKeepOut(rects: Rect[]): void;
  /** testes: buraco negro, nós e uma amostra das partículas na tela, a área da nuvem e a rotação */
  debug(): {
    hole: { x: number; y: number; r: number; ex: number; ey: number };
    nodes: { x: number; y: number }[];
    dust: { x: number; y: number }[];
    sphere: { cx: number; cy: number; r: number };
    keep: Rect[];
    margin: number;
    rot: { mode: number; idle: number; q: number[] };
    w: number;
    h: number;
  };
  /** testes: fixa a orientação da nuvem (quaternion) */
  debugOrient(x: number, y: number, z: number, w: number): void;
  destroy(): void;
};

export function createConstellation(
  canvas: HTMLCanvasElement,
  nNodes: number,
  opts: { count: number; stars: number; simple: boolean; layout?: Layout; keep?: Rect[]; onLost(): void },
): Constellation {
  const n = Math.min(nNodes, MAX_NODES);
  const L = opts.layout ?? makeLayout(n, opts.count, opts.stars);
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  /* produção: sem ler o log de cada shader (consultas síncronas à GPU) */
  if (process.env.NODE_ENV === "production") renderer.debug.checkShaderErrors = false;
  renderer.setClearColor(0x000000, 0);
  /* sem conversão de cor nos materiais prontos (linhas): o mesmo brilho com e sem o pass de lente */
  renderer.outputColorSpace = LinearSRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 2, 0.1, 50);
  camera.position.set(0, 0, CAMERA_Z);
  /* a nuvem: origem = centróide (pivô); só o resize muda posição e escala */
  const cloud = new Group();
  scene.add(cloud);

  const white = new Vector3(0.93, 0.92, 0.88);
  const amber = new Vector3(0.96, 0.65, 0.14);

  /* partículas */
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new BufferAttribute(L.points, 3));
  dustGeo.setAttribute("aSeed", new BufferAttribute(L.seeds, 1));
  dustGeo.setAttribute("aTone", new BufferAttribute(L.tones, 1));
  dustGeo.setAttribute("aSize", new BufferAttribute(L.sizes, 1));
  const dustMat = new ShaderMaterial({
    vertexShader: DUST_VS,
    fragmentShader: DUST_FS,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPR: { value: dpr },
      uAspect: { value: 2 },
      uPush: { value: 0 },
      uScale: { value: 15 },
      uRes2: { value: new Vector2(1, 1) },
      uHole: { value: new Vector4(0, 0, 1, 1) },
      uDepthR: { value: 1 },
      uKeep: { value: Array.from({ length: 4 }, () => new Vector4(-1e5, -1e5, -1e5, -1e5)) },
      uMouse: { value: [9, 9] },
      uWave: { value: [0, 0, 0] },
      uWaveA: { value: 0 },
      uWhite: { value: white },
      uAmber: { value: amber },
    },
  });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false; // a deriva sai do shader
  cloud.add(dust);

  /* camada 1: estrelas, fora do grupo da rede (não giram com ela) */
  const starGeo = new BufferGeometry();
  starGeo.setAttribute("aStar", new BufferAttribute(L.stars, 4));
  /* o three precisa de "position" para contar os vértices; o shader não usa */
  starGeo.setAttribute("position", new BufferAttribute(new Float32Array(L.starCount * 3), 3));
  const starMat = new ShaderMaterial({
    vertexShader: STAR_VS,
    fragmentShader: STAR_FS,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPR: { value: dpr },
      uAspect: { value: 2 },
      uTan: { value: Math.tan(((FOV / 2) * Math.PI) / 180) },
      uPar: { value: new Vector2() },
      uRes2: { value: new Vector2(1, 1) },
      uKeep: { value: Array.from({ length: 4 }, () => new Vector4(-1e5, -1e5, -1e5, -1e5)) },
      uWhite: { value: white },
      uAmber: { value: amber },
    },
  });
  const stars = new Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -1;
  scene.add(stars);
  /* parallax das estrelas: o cursor suavizado (só mouse) */
  const par = { x: 0, y: 0, tx: 0, ty: 0 };

  /* linhas finas só entre nós principais (vizinhos mais próximos), fixas */
  const seg = new Float32Array(L.links.length * 6);
  const segCol = new Float32Array(L.links.length * 6);
  L.links.forEach(([i, j], k) => {
    seg.set(L.nodes.subarray(i * 3, i * 3 + 3), k * 6);
    seg.set(L.nodes.subarray(j * 3, j * 3 + 3), k * 6 + 3);
    const a = 0.22;
    segCol.set([amber.x * a, amber.y * a, amber.z * a, amber.x * a, amber.y * a, amber.z * a], k * 6);
  });
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(seg, 3));
  lineGeo.setAttribute("color", new BufferAttribute(segCol, 3));
  const lineMat = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const lines = new LineSegments(lineGeo, lineMat);
  cloud.add(lines);

  /* nós principais: presos à nuvem (giram junto, nunca migram) */
  const nodeGeo = new BufferGeometry();
  nodeGeo.setAttribute("position", new BufferAttribute(L.nodes, 3));
  nodeGeo.setAttribute("aIndex", new BufferAttribute(Float32Array.from({ length: n }, (_, i) => i), 1));
  const lit = new Array(MAX_NODES).fill(0);
  const nodeMat = new ShaderMaterial({
    vertexShader: NODE_VS,
    fragmentShader: NODE_FS,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPR: { value: dpr },
      uLit: { value: lit },
      uHover: { value: -1 },
      uDepthR: { value: 1 },
      uWhite: { value: white },
      uAmber: { value: amber },
    },
  });
  cloud.add(new Points(nodeGeo, nodeMat));

  /* ---------- buraco negro (pass em tela cheia) ---------- */
  const bhUniforms = {
    tScene: { value: null as unknown },
    uRes: { value: new Vector2(1, 1) },
    uBH: { value: new Vector2() },
    uScale: { value: 20 },
    uTime: { value: 0 },
    uIncl: { value: 0.16 },
    uRoll: { value: 0 },
    uCursor: { value: new Vector2(-1e4, -1e4) },
    uCM: { value: 0 },
    uE2: { value: 5.2 },
    uBg: { value: new Vector3(0.043, 0.051, 0.063) },
    uWhite: { value: white },
    uAmber: { value: amber },
  };
  const quad = new PlaneGeometry(2, 2);
  const lensMat = new ShaderMaterial({ vertexShader: POST_VS, fragmentShader: LENS_FS, uniforms: bhUniforms, depthTest: false, depthWrite: false });
  const simpleMat = new ShaderMaterial({ vertexShader: POST_VS, fragmentShader: SIMPLE_FS, uniforms: bhUniforms, transparent: true, depthTest: false, depthWrite: false });
  const post = new Mesh(quad, lensMat);
  post.frustumCulled = false;
  const postScene = new Scene();
  postScene.add(post);
  const postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let rt: WebGLRenderTarget | null = null;

  /* ---------- estado ---------- */
  let W = 1;
  let H = 1;
  let running = false;
  let destroyed = false;
  let raf = 0;
  let last = performance.now();
  let time = 0;
  const bhNdc = { x: -0.5, y: 0 };
  let pxPerRs = 20;
  let keep: Rect[] = opts.keep ?? [];
  let fit: Fit | null = null;
  let rpx = 100; // raio da esfera na tela (px)
  const m = { x: 9, y: 9, vx: 0, vy: 0, tx: 9, ty: 9 };
  const pk = { v: 0, p: 0, t: 0 };
  const cm = { v: 0 };
  /*
   * Rotação (quaternion, em volta do centróide):
   * mode 0: automática, devagar, em volta do eixo vertical (entra em 1,5 s);
   * mode 1: arrastando (trackball 1:1); mode 2: solta — inércia
   * (×0,92 por quadro de 60 Hz) e fica onde parou; 6 s sem interação → 0.
   * tilt: o disco do buraco negro inclina com o arraste (±6°) e volta devagar.
   */
  const AUTO = 0.07; // rad/s (~90 s por volta)
  const IDLE = 6;
  const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.12); // a inclinação original
  const omega = new Vector3(); // velocidade angular (eixo × rad/s), no mundo
  const rot = { mode: 0, idle: 0, auto: 1, last: 0 };
  const tilt = { x: 0, y: 0 };
  const TILT = (6 * Math.PI) / 180;
  const Y = new Vector3(0, 1, 0);
  const axis = new Vector3();
  const dq = new Quaternion();
  const turn = (ax: Vector3, angle: number) => {
    if (!angle) return;
    dq.setFromAxisAngle(ax, angle);
    q.premultiply(dq).normalize();
  };

  let waveT = -1;
  let waveMax = 0;
  let waveOrder: { i: number; d: number }[] = [];
  let waveLit: (i: number) => void = () => {};
  let waveEnd: () => void = () => {};

  const screen = new Float32Array(n * 2);
  const v = new Vector3();
  const buf = new Vector2();

  /* ---------- qualidade ---------- */
  let level = opts.simple ? 3 : (chosen?.level ?? 0);
  let quality: Quality = LADDER[level];
  /* queda automática: janelas de 0,5 s; slow = desde quando o fps está < 40 */
  const watch = { t0: -1, frames: 0, slow: -1 };
  function res() {
    const k = quality === "lens-0.75" ? 0.75 : quality === "lens-0.5" ? 0.5 : 1;
    renderer.setPixelRatio(dpr * k);
    W = H = -1; // força o resize
  }
  function applyQuality() {
    quality = LADDER[level];
    canvas.dataset.quality = quality;
    res();
    dustGeo.setDrawRange(0, level >= 2 ? Math.floor(L.count * 0.65) : L.count);
    starGeo.setDrawRange(0, level >= 2 ? Math.floor(L.starCount * 0.6) : L.starCount);
    post.material = quality === "simple" ? simpleMat : lensMat;
    /* sem lente a cena vai direto para o canvas: fundo opaco (linhas aditivas não "furam" o fundo) */
    renderer.setClearColor(quality === "simple" ? 0x0b0d10 : 0x000000, quality === "simple" ? 1 : 0);
    if (quality === "simple") {
      rt?.dispose();
      rt = null;
    }
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (w === W && h === H && fit) return;
    W = w;
    H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    dustMat.uniforms.uAspect.value = w / h;
    starMat.uniforms.uAspect.value = w / h;
    starMat.uniforms.uRes2.value.set(w, h);
    /* buraco negro (holeCenter) e o maior círculo livre para a nuvem (fitSphere) */
    fit = fitSphere(w, h, keep);
    const hc = fit.hc;
    bhNdc.x = (hc.x / w) * 2 - 1;
    bhNdc.y = 1 - (hc.y / h) * 2;
    pxPerRs = hc.rs;
    const pc = placeCloud(fit, w, h, L.radius);
    cloud.position.set(pc.x, pc.y, 0);
    cloud.scale.setScalar(pc.scale);
    rpx = pc.rpx;
    /* profundidade dentro da rede (nós e partículas de trás menores e mais apagados) */
    dustMat.uniforms.uDepthR.value = nodeMat.uniforms.uDepthR.value = L.radius * pc.scale;
    dustMat.uniforms.uRes2.value.set(w, h);
    /* a rede pode passar atrás do disco (a lente o desenha por cima); só some na sombra */
    dustMat.uniforms.uHole.value.set(hc.x, hc.y, 2.6 * 1.25 * hc.rs, 2.6 * 1.25 * hc.rs);
    const pad = KEEP_PAD / 2;
    for (const mat of [dustMat, starMat])
      (mat.uniforms.uKeep.value as Vector4[]).forEach((b, i) => {
        const r = keep[i];
        if (r) b.set(r.x - pad, r.y - pad, r.x + r.w + pad, r.y + r.h + pad);
        else b.set(-1e5, -1e5, -1e5, -1e5);
      });
    renderer.getDrawingBufferSize(buf);
    const pr = buf.x / w;
    bhUniforms.uRes.value.copy(buf);
    bhUniforms.uScale.value = pxPerRs * pr;
    bhUniforms.uBH.value.set((bhNdc.x * 0.5 + 0.5) * buf.x, (bhNdc.y * 0.5 + 0.5) * buf.y);
    if (quality !== "simple") {
      if (!rt) rt = new WebGLRenderTarget(buf.x, buf.y, { type: HalfFloatType, depthBuffer: false });
      else rt.setSize(buf.x, buf.y);
      bhUniforms.tScene.value = rt.texture;
    }
  }

  const toPx = (x: number, y: number, z: number) => {
    v.set(x, y, z).applyMatrix4(cloud.matrixWorld).project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  };
  function project() {
    cloud.quaternion.copy(q);
    cloud.updateMatrixWorld();
    for (let i = 0; i < n; i++) {
      const p = toPx(L.nodes[i * 3], L.nodes[i * 3 + 1], L.nodes[i * 3 + 2]);
      screen[i * 2] = p.x;
      screen[i * 2 + 1] = p.y;
    }
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    /* só para baixo: fps < 40 por mais de 2 s (janelas de 0,5 s) → um degrau */
    if (level < LADDER.length - 1) {
      const sec = now / 1000; // relógio real: o tempo da cena é limitado por quadro
      if (watch.t0 < 0) watch.t0 = sec + 0.3;
      else if (sec >= watch.t0) {
        watch.frames++;
        if (sec - watch.t0 >= 0.5) {
          const fps = watch.frames / (sec - watch.t0);
          if (fps >= 40) watch.slow = -1;
          else if (watch.slow < 0) watch.slow = watch.t0;
          else if (sec - watch.slow > 2) {
            level++;
            applyQuality();
            resize();
            draw();
            if (chosen) chosen.level = level;
            watch.slow = -1;
            watch.t0 = sec + 0.4; // depois da troca, nova janela
            watch.frames = 0;
            if (running) raf = requestAnimationFrame(frame);
            return;
          }
          watch.t0 = sec;
          watch.frames = 0;
        }
      }
    }
    resize();

    const ax = 60 * (m.tx - m.x) - 9 * m.vx;
    const ay = 60 * (m.ty - m.y) - 9 * m.vy;
    m.vx += ax * dt;
    m.vy += ay * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    /* arrastando: sem o "empurrão" da poeira em volta do cursor (viraria um anel no meio da nuvem) */
    const ap = 40 * ((rot.mode === 1 ? 0 : pk.t) - pk.p) - 7 * pk.v;
    pk.v += ap * dt;
    pk.p += pk.v * dt;

    /* rotação (ver rot): a do arraste já foi aplicada no próprio evento */
    if (rot.mode !== 1) {
      const w = omega.length();
      if (w > 1e-4) {
        turn(axis.copy(omega).divideScalar(w), w * dt);
        omega.multiplyScalar(Math.pow(0.92, dt * 60));
      } else omega.set(0, 0, 0);
      rot.idle += dt;
      if (rot.mode === 2 && rot.idle >= IDLE) {
        rot.mode = 0;
        rot.auto = 0;
      }
      if (rot.mode === 0) {
        rot.auto = Math.min(1, rot.auto + dt / 1.5);
        turn(Y, AUTO * rot.auto * rot.auto * dt);
      }
      const k = Math.exp(-1.5 * dt); // o disco volta devagar
      tilt.x *= k;
      tilt.y *= k;
    }

    let wa = 0;
    let wr = 0;
    if (waveT >= 0) {
      const e = time - waveT;
      wr = e * 1.15;
      const prog = wr / waveMax;
      wa = 1 - Math.max(0, Math.min(1, (prog - 0.75) / 0.25));
      while (waveOrder.length && waveOrder[0].d <= wr) {
        const { i } = waveOrder.shift()!;
        lit[i] = 1;
        waveLit(i);
      }
      if (prog >= 1) {
        waveT = -1;
        wa = 0;
        waveEnd();
      }
    }

    const u = dustMat.uniforms;
    u.uTime.value = time;
    u.uMouse.value = [m.x, m.y];
    u.uPush.value = pk.p;
    u.uWave.value = [bhNdc.x, bhNdc.y, wr];
    u.uWaveA.value = wa;
    nodeMat.uniforms.uTime.value = time;
    /* estrelas: parallax suave atrás do cursor; volta ao centro sem ele */
    const pf = Math.min(1, dt * 2.5);
    par.x += (par.tx - par.x) * pf;
    par.y += (par.ty - par.y) * pf;
    starMat.uniforms.uTime.value = time;
    starMat.uniforms.uPar.value.set(-par.x, -par.y);

    /* buraco negro: o disco inclina de leve com o arraste (±6°); o cursor perto dele pesa na lente */
    bhUniforms.uTime.value = time;
    bhUniforms.uIncl.value = Math.max(0.04, 0.16 + tilt.x);
    bhUniforms.uRoll.value = -tilt.y;
    const pr = bhUniforms.uRes.value.x / W;
    const cx = (m.x * 0.5 + 0.5) * W, cy = (m.y * 0.5 + 0.5) * H;
    const bx = (bhNdc.x * 0.5 + 0.5) * W, by = (bhNdc.y * 0.5 + 0.5) * H;
    const dRs = Math.hypot(cx - bx, cy - by) / pxPerRs;
    const near = Math.max(0, Math.min(1, (18 - dRs) / 10)) * Math.max(0, pk.p);
    cm.v += (near * 0.9 - cm.v) * Math.min(1, dt * 6);
    bhUniforms.uCursor.value.set(cx * pr, cy * pr);
    bhUniforms.uCM.value = cm.v;

    project();
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }

  function draw() {
    cloud.quaternion.copy(q);
    if (quality === "simple" || !rt) {
      renderer.setRenderTarget(null);
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.render(postScene, postCam);
      renderer.autoClear = true;
    } else {
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    }
  }

  const toNdc = (x: number, y: number) => ({ x: (x / W) * 2 - 1, y: 1 - (y / H) * 2 });

  const onLost = (e: Event) => {
    e.preventDefault();
    running = false;
    cancelAnimationFrame(raf);
    opts.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  applyQuality();
  resize();
  project();

  const idle = () =>
    new Promise<void>((r) => ("requestIdleCallback" in window ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));

  return {
    async warm() {
      /* 1. shaders da cena (poeira, linhas, nós), fora da main thread quando
       *    há KHR_parallel_shader_compile */
      for (const obj of [stars, ...cloud.children]) {
        await idle(); // um programa por idle: cada envio de shader custa ~15–25 ms com CPU 4×
        if (destroyed) return;
        resize();
        try {
          await renderer.compileAsync(obj, camera, scene);
        } catch {
          /* sem suporte: compila no render de aquecimento */
        }
      }
      /* 2. os dois passes finais (lente e simple): a escada de qualidade pode trocar */
      for (const mat of opts.simple ? [simpleMat] : [lensMat, simpleMat]) {
        await idle();
        post.material = mat;
        try {
          await renderer.compileAsync(postScene, postCam);
        } catch {
          /* idem */
        }
      }
      post.material = quality === "simple" ? simpleMat : lensMat;
      /* 3. render de aquecimento fora da tela (sobe buffers e render target para a GPU) */
      await idle();
      if (destroyed) return;
      resize();
      project();
      draw();
      /* 4. todos os programas linkaram? Sem KHR_parallel_shader_compile é
       *    aqui que o link acontece: um programa por idle. Erro de shader vira
       *    exceção: o componente cai na imagem estática em vez de um canvas
       *    vazio (em produção o three não confere os shaders). */
      const gl = renderer.getContext();
      type Prog = { program: WebGLProgram; vertexShader?: WebGLShader; fragmentShader?: WebGLShader; name?: string };
      for (const p of (renderer.info.programs ?? []) as unknown as Prog[]) {
        await idle();
        if (destroyed) return;
        if (gl.isContextLost()) throw new Error("contexto perdido durante o aquecimento");
        if (gl.getProgramParameter(p.program, gl.LINK_STATUS)) continue;
        const logs = [gl.getProgramInfoLog(p.program), p.vertexShader && gl.getShaderInfoLog(p.vertexShader), p.fragmentShader && gl.getShaderInfoLog(p.fragmentShader)];
        throw new Error(`shader ${p.name || "?"}: ${logs.filter(Boolean).join(" | ").trim().slice(0, 600) || "link falhou"}`);
      }
      const err = gl.getError();
      if (err && err !== gl.CONTEXT_LOST_WEBGL) throw new Error(`WebGL erro 0x${err.toString(16)} no aquecimento`);
    },
    choose() {
      if (!chosen) chosen = pickLevel(renderer.getContext(), opts.simple);
      if (chosen.level !== level) {
        level = chosen.level;
        applyQuality();
        /* buffer e render target já no tamanho do nível, e um quadro nele:
         * ao ligar o loop nada é realocado */
        resize();
        draw();
      }
      canvas.dataset.qualityWhy = chosen.why;
      return { quality, why: chosen.why };
    },
    run(on) {
      if (on === running) return;
      running = on;
      if (on) glCensus(renderer, "audit");
      if (on) {
        last = performance.now();
        watch.t0 = -1; // recomeça a vigia depois de uma pausa
        watch.slow = -1;
        watch.frames = 0;
        if (!raf) raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    pointer(x, y, inside) {
      const p = toNdc(x, y);
      if (inside) {
        if (pk.t === 0 && Math.abs(m.x) > 5) {
          m.x = p.x;
          m.y = p.y;
        }
        m.tx = p.x;
        m.ty = p.y;
      }
      par.tx = inside ? p.x : 0;
      par.ty = inside ? p.y : 0;
      pk.t = inside ? 1 : 0;
    },
    inArea(x, y) {
      return !!fit && Math.hypot(x - fit.cx, y - fit.cy) <= fit.r;
    },
    grab() {
      rot.mode = 1;
      rot.idle = 0;
      rot.last = performance.now();
      omega.set(0, 0, 0);
    },
    dragBy(dx, dy) {
      if (rot.mode !== 1) return;
      const now = performance.now();
      const dts = Math.max(0.008, Math.min(0.1, (now - rot.last) / 1000));
      rot.last = now;
      const len = Math.hypot(dx, dy);
      if (!len) return;
      /* trackball: gira em volta do eixo da tela perpendicular ao arraste; o
       * ponto da frente da esfera acompanha o mouse (ângulo = px / raio) */
      axis.set(dy / len, dx / len, 0);
      const angle = len / rpx;
      turn(axis, angle);
      /* velocidade para a inércia (média móvel, limitada a ~1 volta/s) */
      omega.multiplyScalar(0.4).addScaledVector(axis, (angle / dts) * 0.6);
      if (omega.length() > 6) omega.setLength(6);
      tilt.x = Math.max(-TILT, Math.min(TILT, tilt.x + (dy / rpx) * 0.35));
      tilt.y = Math.max(-TILT, Math.min(TILT, tilt.y + (dx / rpx) * 0.35));
      project(); // nós na posição nova já neste evento (cartão/hover)
    },
    release() {
      if (rot.mode !== 1) return;
      if (performance.now() - rot.last > 80) omega.set(0, 0, 0); // parou antes de soltar
      rot.mode = 2;
      rot.idle = 0;
    },
    setKeepOut(rects) {
      const same = rects.length === keep.length && rects.every((r, i) => (["x", "y", "w", "h"] as const).every((k) => Math.abs(r[k] - keep[i][k]) < 1));
      if (same) return;
      keep = rects.slice(0, 4);
      fit = null; // força o resize a recalcular onde a nuvem cabe
      resize();
      project();
    },
    hit(x, y) {
      let best = -1;
      let bd = 22 * 22;
      for (let i = 0; i < n; i++) {
        const dx = screen[i * 2] - x;
        const dy = screen[i * 2 + 1] - y;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return best;
    },
    nodeAt(i) {
      return { x: screen[i * 2], y: screen[i * 2 + 1] };
    },
    debug() {
      project();
      const dust: { x: number; y: number }[] = [];
      for (let p = 0; p < L.count; p += 7) dust.push(toPx(L.points[p * 3], L.points[p * 3 + 1], L.points[p * 3 + 2]));
      return {
        hole: { x: (bhNdc.x * 0.5 + 0.5) * W, y: (-bhNdc.y * 0.5 + 0.5) * H, r: DISK_RS * pxPerRs, ex: fit?.ex ?? 0, ey: fit?.ey ?? 0 },
        nodes: Array.from({ length: n }, (_, i) => ({ x: screen[i * 2], y: screen[i * 2 + 1] })),
        dust,
        sphere: { cx: fit?.cx ?? 0, cy: fit?.cy ?? 0, r: fit?.r ?? 0 },
        keep: keep.map((r) => ({ ...r })),
        margin: SAFE,
        rot: { mode: rot.mode, idle: rot.idle, q: [q.x, q.y, q.z, q.w] },
        w: W,
        h: H,
      };
    },
    debugOrient(x, y, z, w) {
      q.set(x, y, z, w).normalize();
      omega.set(0, 0, 0);
      rot.mode = 2;
      rot.idle = 0;
      project();
    },
    hover(i) {
      nodeMat.uniforms.uHover.value = i;
    },
    wave(onLit, onEnd) {
      const c = bhNdc;
      const asp = W / H;
      lit.fill(0);
      waveOrder = Array.from({ length: n }, (_, i) => {
        const p = toNdc(screen[i * 2], screen[i * 2 + 1]);
        return { i, d: Math.hypot((p.x - c.x) * asp, p.y - c.y) };
      }).sort((a, b) => a.d - b.d);
      waveMax = Math.max(...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => Math.hypot((sx - c.x) * asp, sy - c.y)))) + 0.1;
      waveLit = onLit;
      waveEnd = onEnd;
      waveT = time;
    },
    destroy() {
      destroyed = true;
      running = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const d of [starGeo, starMat, dustGeo, dustMat, lineGeo, lineMat, nodeGeo, nodeMat, quad, lensMat, simpleMat]) d.dispose();
      rt?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
