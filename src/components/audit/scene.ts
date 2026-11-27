/*
 * AUDIT: constelação + buraco negro (three.js). Carregado só quando a seção é
 * a dona do WebGL (lib/gl-slot), via import dinâmico. Um único contexto, um
 * único canvas.
 *
 * Render (qualidade "lens"):
 *   1. a cena (poeira, linhas, nós) vai para um render target
 *   2. um pass em tela cheia faz a lente gravitacional em screen-space
 *      (lente fina: curva as partículas em volta do buraco negro; o cursor
 *      perto dele soma uma lente fraca, "como se tivesse massa") e, só num
 *      círculo em volta do buraco negro, um raymarch das geodésicas da luz
 *      (Schwarzschild, unidades de rs) que desenha o horizonte, o disco de
 *      acreção (girando, com Doppler: o lado que se aproxima é mais brilhante,
 *      e a imagem curvada da parte de trás) e o anel de fótons
 * Qualidade "simple" (celular, máquinas fracas): sem render target nem lente;
 * o mesmo disco/anel/horizonte desenhados analiticamente por cima da cena.
 *
 * Preparação (lib/gl-slot): a cena nasce PARADA, cedo (quando o usuário
 * chega ao WORK, bem antes da STACK); warm() compila os shaders em paralelo
 * (compileAsync + KHR_parallel_shader_compile) e faz um render de
 * aquecimento, em pedaços (requestIdleCallback). As posições das partículas
 * chegam prontas (layout.worker, buffers transferidos, uma vez só).
 *
 * Qualidade: sem benchmark (nenhum quadro extra no meio da rolagem).
 * choose() lê o tempo por quadro que a STACK mediu enquanto rodava, com
 * núcleos, memória e o nome da GPU como desempate (lib/gpu-perf), antes de
 * a seção aparecer: lente 1,0 / 0,75 / 0,5 (65% das partículas) ou simple.
 * Vale para a sessão inteira. Depois de visível só desce: fps < 40 por mais
 * de 2 s → um degrau abaixo (até "simple"), aplicado direto.
 * "simple" (sem lente) é fixo no celular/toque.
 * Durante a revelação em círculo o loop fica parado (AuditField); a cena é
 * criada uma vez por página e depois só pausa/retoma.
 *
 * Movimento: tudo no vertex shader (a CPU nunca reescreve partículas). Por
 * frame a CPU soma a oscilação dos ~10 nós (presos ao repouso), integra as molas e a rotação e
 * projeta os nós (hover/cartão). DPR ≤ 1,5; loop parado fora da tela e com a
 * aba oculta (o componente chama run(false)).
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

import { CAMERA_Z, DISK_RS, DUST_TILT, FOV, HALF_H, KEEP_PAD, makeLayout, region, ringPairs, type Layout, type Rect, type Region } from "./layout";

const MAX_NODES = 12;
/* raio da sombra em rs (≈ 2,6 rs: 3√3/2) */
const SHADOW = 2.6;

const DUST_VS = /* glsl */ `
attribute vec4 aRef;   // tipo, i, j, t
attribute float aSeed;
attribute float aTone;
attribute float aSize;
uniform vec3 uNode[${MAX_NODES}];
uniform float uTime;
uniform float uPR;
uniform float uAspect;
uniform float uPush;
uniform float uScale;
uniform float uRin;     // anel da poeira (espaço local): borda de dentro
uniform float uRout;    // e de fora
uniform float uSpread;  // escala dos aglomerados e filamentos dos nós
uniform vec2 uRes2;     // tamanho do campo (px CSS)
uniform vec4 uHole;     // xy: centro do buraco negro (px, origem em cima), zw: semi-eixos da área proibida (px)
uniform vec4 uKeep[4];  // caixas de texto (px: x0, y0, x1, y1, já com folga)
uniform vec2 uMouse;
uniform vec3 uWave;     // xy: centro (NDC), z: raio
uniform float uWaveA;
uniform float uDepthR;  // meia profundidade dos nós para apagar o fundo (0 = desliga)
varying float vA;
varying float vTone;
varying float vGlow;
vec3 tiltX(vec3 q) {
  float c = cos(${DUST_TILT.toFixed(3)}), s = sin(${DUST_TILT.toFixed(3)});
  return vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
}
void main() {
  vec3 p;
  float fade = 1.0;
  if (aRef.x < 0.5) {
    p = uNode[int(aRef.y + 0.5)] + position * uSpread;
  } else if (aRef.x < 1.5) {
    p = mix(uNode[int(aRef.y + 0.5)], uNode[int(aRef.z + 0.5)], aRef.w) + position * uSpread;
  } else if (aRef.x < 2.5) {
    // órbita no anel (Kepler: ω ∝ r^-1.5)
    float r0 = mix(uRin, uRout, position.x);
    float a = position.y + uTime * 0.2 * pow(r0, -1.5);
    p = tiltX(vec3(cos(a) * r0, sin(a) * r0, position.z * r0));
  } else {
    // espiral: da borda de fora até a de dentro em T s; "engolida" some antes
    // de chegar ao disco e renasce na borda de fora (fract)
    float T = position.z;
    float f = fract(uTime / T + aSeed);
    float rr = mix(uRin, uRout, position.x * (1.0 - f));
    float a = position.y + f * 2.4;
    p = tiltX(vec3(cos(a) * rr, sin(a) * rr, 0.0));
    fade = smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.85, f);
  }
  float t = uTime * 0.25 + aSeed * 6.2831;
  p += vec3(sin(t * 1.3), cos(t * 1.1), sin(t * 0.7)) * 0.035;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;

  vec2 d = ndc - uMouse;
  d.x *= uAspect;
  float dist = length(d);
  float push = uPush * exp(-dist * dist / 0.035);
  vec2 dir = d / max(dist, 1e-4);
  dir.x /= uAspect;
  ndc += dir * push * 0.16;

  vec2 dw = ndc - uWave.xy;
  dw.x *= uAspect;
  float ring = abs(length(dw) - uWave.z);
  float glow = uWaveA * exp(-ring * ring / 0.0025);

  clip.xy = ndc * clip.w;
  gl_Position = clip;

  /* nunca sobre o disco nem sobre os textos: some (suave) dentro da área
   * proibida do buraco negro e das caixas de texto */
  vec2 px = vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * uRes2;
  fade *= smoothstep(1.0, 1.2, length((px - uHole.xy) / uHole.zw));
  for (int k = 0; k < 4; k++) {
    vec4 b = uKeep[k];
    float dk = max(max(b.x - px.x, px.x - b.z), max(b.y - px.y, px.y - b.w));
    fade *= smoothstep(0.0, 10.0, dk);
  }
  float tw = 0.75 + 0.25 * sin(uTime * 1.7 + aSeed * 40.0);
  vA = ((0.36 + 0.24 * aTone) * tw + abs(push) * 0.5) * fade;
  /* poeira dos nós e filamentos: a do fundo mais apagada (perspectiva já reduz o tamanho) */
  if (uDepthR > 0.0 && aRef.x < 1.5) vA *= mix(0.35, 1.0, clamp(0.5 + 0.5 * (${CAMERA_Z.toFixed(1)} + mv.z) / uDepthR, 0.0, 1.0));
  vTone = aTone;
  vGlow = glow * fade;
  gl_PointSize = aSize * uPR * uScale * (1.0 + glow * 1.8) / -mv.z;
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
  pointer(x: number, y: number, inside: boolean): void;
  dragBy(dx: number, dy: number): void;
  /** fim do arrasto (dedo/botão solto) */
  release(): void;
  hit(x: number, y: number): number;
  nodeAt(i: number): { x: number; y: number };
  hover(i: number): void;
  /** compila os shaders e faz um render de aquecimento, em pedaços ociosos */
  warm(): Promise<void>;
  /** escolhe o nível (uma vez por sessão; sem renderizar nada a mais) */
  choose(): { quality: string; why: string };
  /** onda de scan saindo do horizonte; acende os nós na ordem em que o anel os alcança */
  wave(onLit: (i: number) => void, onEnd: () => void): void;
  /** caixas de texto por cima do campo (px do campo): o sistema não as invade */
  setKeepOut(rects: Rect[]): void;
  /** testes: buraco negro, nós na tela, posições de repouso, caixas e rotação */
  debug(): {
    hole: { x: number; y: number; r: number; ex: number; ey: number };
    nodes: { x: number; y: number }[];
    homes: { x: number; y: number }[];
    keep: Rect[];
    margin: number;
    rot: { yaw: number; pitch: number; mode: number };
    w: number;
    h: number;
  };
  destroy(): void;
};

export function createConstellation(
  canvas: HTMLCanvasElement,
  nNodes: number,
  opts: { count: number; simple: boolean; layout?: Layout; keep?: Rect[]; onLost(): void },
): Constellation {
  const n = Math.min(nNodes, MAX_NODES);
  const L = opts.layout ?? makeLayout(n, opts.count);
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
  const group = new Group();
  scene.add(group);

  const white = new Vector3(0.93, 0.92, 0.88);
  const amber = new Vector3(0.96, 0.65, 0.14);

  /* nós: presos à posição de repouso (region(), recalculada no resize), com
   * uma oscilação de no máximo ~8 px; a CPU só soma a oscilação por frame */
  const nodePos = new Float32Array(n * 3);
  const nodeVec = Array.from({ length: MAX_NODES }, () => new Vector3());
  const home = new Float32Array(n * 3);
  let osc = 0; // amplitude da oscilação (espaço local)
  let keep: Rect[] = opts.keep ?? [];
  let reg: Region | null = null;
  const updateNodes = (t: number) => {
    for (let i = 0; i < n; i++) {
      const x = home[i * 3] + osc * Math.sin(t * 0.53 + i * 1.9);
      const y = home[i * 3 + 1] + osc * Math.cos(t * 0.41 + i * 2.7);
      const z = home[i * 3 + 2] + osc * Math.sin(t * 0.37 + i * 0.8);
      nodePos[i * 3] = x;
      nodePos[i * 3 + 1] = y;
      nodePos[i * 3 + 2] = z;
      nodeVec[i].set(x, y, z);
    }
  };

  /* partículas */
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new BufferAttribute(L.points, 3));
  dustGeo.setAttribute("aRef", new BufferAttribute(L.ref, 4));
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
      uNode: { value: nodeVec },
      uTime: { value: 0 },
      uPR: { value: dpr },
      uAspect: { value: 2 },
      uPush: { value: 0 },
      uScale: { value: 15 },
      uRin: { value: 1 },
      uRout: { value: 3 },
      uSpread: { value: 0.4 },
      uRes2: { value: new Vector2(1, 1) },
      uHole: { value: new Vector4(0, 0, 1, 1) },
      uKeep: { value: Array.from({ length: 4 }, () => new Vector4(-1e5, -1e5, -1e5, -1e5)) },
      uMouse: { value: [9, 9] },
      uWave: { value: [0, 0, 0] },
      uWaveA: { value: 0 },
      uDepthR: { value: 0 },
      uWhite: { value: white },
      uAmber: { value: amber },
    },
  });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false; // posições saem do shader
  group.add(dust);

  /* linhas: os vizinhos na volta do anel (os mesmos pares dos filamentos);
   * uma linha que passaria por cima do disco não acende */
  const pairs = ringPairs(n);
  const seg = new Float32Array(pairs.length * 6);
  const segCol = new Float32Array(pairs.length * 6);
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(seg, 3));
  lineGeo.setAttribute("color", new BufferAttribute(segCol, 3));
  const lineMat = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const lines = new LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  group.add(lines);
  let lineOk = new Float32Array(pairs.length).fill(1);
  const updateLines = () => {
    pairs.forEach(([i, j], k) => {
      seg.set(nodePos.subarray(i * 3, i * 3 + 3), k * 6);
      seg.set(nodePos.subarray(j * 3, j * 3 + 3), k * 6 + 3);
      const v = 0.2 * lineOk[k];
      segCol.set([amber.x * v, amber.y * v, amber.z * v, amber.x * v, amber.y * v, amber.z * v], k * 6);
    });
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.color.needsUpdate = true;
  };

  /* nós principais */
  const nodeGeo = new BufferGeometry();
  nodeGeo.setAttribute("position", new BufferAttribute(nodePos, 3));
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
      uDepthR: { value: 0 },
      uWhite: { value: white },
      uAmber: { value: amber },
    },
  });
  const nodesPts = new Points(nodeGeo, nodeMat);
  nodesPts.frustumCulled = false;
  group.add(nodesPts);

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
  const m = { x: 9, y: 9, vx: 0, vy: 0, tx: 9, ty: 9 };
  const pk = { v: 0, p: 0, t: 0 };
  const cm = { v: 0 };
  /*
   * Rotação do sistema inteiro em volta do buraco negro (pivô = centro dele):
   * yaw ±40°, pitch ±15°; o disco inclina junto (±8°, uIncl/uRoll).
   * mode 1: arrastando (o dedo/mouse manda); 2: inércia curta (≤ 400 ms,
   * decaindo); 0: mola criticamente amortecida até a pose de repouso
   * (~1,5 s). Nunca gira indefinidamente. No celular, sem toque, a pose de
   * repouso vai e volta em yaw ±20° (16 s por ciclo).
   */
  const YAW = (40 * Math.PI) / 180, PITCH = (15 * Math.PI) / 180, AUTO = (20 * Math.PI) / 180;
  const rot = { yaw: 0, pitch: 0, vy: 0, vp: 0, mode: 0, t: 0, auto: 0, last: 0 };
  let autoOn = false;
  const clampRot = () => {
    if (Math.abs(rot.yaw) >= YAW) {
      rot.yaw = Math.sign(rot.yaw) * YAW;
      if (rot.vy * rot.yaw > 0) rot.vy = 0;
    }
    if (Math.abs(rot.pitch) >= PITCH) {
      rot.pitch = Math.sign(rot.pitch) * PITCH;
      if (rot.vp * rot.pitch > 0) rot.vp = 0;
    }
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
    const q = quality === "lens-0.75" ? 0.75 : quality === "lens-0.5" ? 0.5 : 1;
    renderer.setPixelRatio(dpr * q);
    W = H = -1; // força o resize
  }
  function applyQuality() {
    quality = LADDER[level];
    canvas.dataset.quality = quality;
    res();
    dustGeo.setDrawRange(0, level >= 2 ? Math.floor(L.count * 0.65) : L.count);
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
    if (w === W && h === H && reg) return;
    W = w;
    H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dustMat.uniforms.uAspect.value = w / h;
    const asp = w / h;
    /* o sistema: buraco negro (layout.holeCenter) + anel livre em volta dele,
     * fora do disco, das margens e das caixas de texto (layout.region) */
    reg = region(w, h, keep, n);
    const hc = reg.hc;
    bhNdc.x = (hc.x / w) * 2 - 1;
    bhNdc.y = 1 - (hc.y / h) * 2;
    pxPerRs = hc.rs;
    const gx = bhNdc.x * HALF_H * asp, gy = bhNdc.y * HALF_H;
    group.position.set(gx, gy, 0);
    group.rotation.set(rot.pitch, rot.yaw, 0);
    group.scale.setScalar(1);
    group.updateMatrixWorld();
    const wpp = (2 * HALF_H) / h; // unidades de cena por px no plano z = 0
    /* repouso dos nós: o px escolhido, numa profundidade que acompanha o
     * plano inclinado da poeira (em cima mais perto, embaixo mais longe) */
    reg.homes.forEach((q, i) => {
      const z = (hc.y - q.y) * wpp * 0.35 + Math.sin(i * 2.3) * 0.12;
      const k = (CAMERA_Z - z) / CAMERA_Z;
      home[i * 3] = ((q.x / w) * 2 - 1) * asp * HALF_H * k - gx;
      home[i * 3 + 1] = (1 - (q.y / h) * 2) * HALF_H * k - gy;
      home[i * 3 + 2] = z;
    });
    osc = 4.5 * wpp;
    const rinW = reg.rin * wpp;
    dustMat.uniforms.uRin.value = rinW;
    dustMat.uniforms.uRout.value = reg.rout * wpp;
    dustMat.uniforms.uSpread.value = 0.38 * rinW;
    dustMat.uniforms.uRes2.value.set(w, h);
    dustMat.uniforms.uHole.value.set(hc.x, hc.y, reg.ex, reg.ey);
    const kb = dustMat.uniforms.uKeep.value as Vector4[];
    const pad = KEEP_PAD / 2;
    kb.forEach((b, i) => {
      const r = keep[i];
      if (r) b.set(r.x - pad, r.y - pad, r.x + r.w + pad, r.y + r.h + pad);
      else b.set(-1e5, -1e5, -1e5, -1e5);
    });
    /* linha cujo meio cai perto do centro: passaria sobre o disco */
    lineOk = Float32Array.from(pairs, ([i, j]) => (Math.hypot((home[i * 3] + home[j * 3]) / 2, (home[i * 3 + 1] + home[j * 3 + 1]) / 2) > rinW * 0.9 ? 1 : 0));
    autoOn = hc.narrow || matchMedia("(pointer: coarse)").matches;
    updateNodes(time);
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

  function project() {
    group.updateMatrixWorld();
    for (let i = 0; i < n; i++) {
      v.set(nodePos[i * 3], nodePos[i * 3 + 1], nodePos[i * 3 + 2]).applyMatrix4(group.matrixWorld).project(camera);
      screen[i * 2] = (v.x * 0.5 + 0.5) * W;
      screen[i * 2 + 1] = (-v.y * 0.5 + 0.5) * H;
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
            /* troca direta (sem capturar o quadro atual: ler o canvas de
             * volta custaria mais que o salto de resolução) */
            level++;
            applyQuality();
            resize();
            updateLines();
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
    const ap = 40 * (pk.t - pk.p) - 7 * pk.v;
    pk.v += ap * dt;
    pk.p += pk.v * dt;

    /* rotação: arrasto → inércia curta → mola até o repouso (ver rot) */
    if (rot.mode === 2) {
      rot.t += dt;
      rot.yaw += rot.vy * dt;
      rot.pitch += rot.vp * dt;
      const k = Math.exp(-7 * dt);
      rot.vy *= k;
      rot.vp *= k;
      clampRot();
      if (rot.t >= 0.4) rot.mode = 0;
    } else if (rot.mode === 0) {
      if (autoOn) rot.auto += dt;
      const ty = autoOn ? AUTO * Math.sin((rot.auto / 16) * Math.PI * 2) : 0;
      const w0 = 4; // criticamente amortecida: assenta em ~1,5 s
      rot.vy += (w0 * w0 * (ty - rot.yaw) - 2 * w0 * rot.vy) * dt;
      rot.vp += (w0 * w0 * (0 - rot.pitch) - 2 * w0 * rot.vp) * dt;
      rot.yaw += rot.vy * dt;
      rot.pitch += rot.vp * dt;
      clampRot();
    }
    group.rotation.set(rot.pitch, rot.yaw, 0);

    updateNodes(time);
    nodeGeo.attributes.position.needsUpdate = true;
    updateLines();

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

    /* buraco negro: inclinação acompanha o arrasto vertical; o cursor perto dele pesa na lente */
    bhUniforms.uTime.value = time;
    /* o disco inclina junto com o sistema, de leve: ±8° nos dois eixos */
    bhUniforms.uIncl.value = Math.max(0.03, 0.16 + rot.pitch * (8 / 15));
    bhUniforms.uRoll.value = -rot.yaw * (8 / 40);
    const pr = bhUniforms.uRes.value.x / W;
    const cx = (m.x * 0.5 + 0.5) * W, cy = (m.y * 0.5 + 0.5) * H;
    const bx = (bhNdc.x * 0.5 + 0.5) * W, by = (bhNdc.y * 0.5 + 0.5) * H;
    const dRs = Math.hypot(cx - bx, cy - by) / pxPerRs;
    const near = Math.max(0, Math.min(1, (18 - dRs) / 10)) * Math.max(0, pk.p);
    cm.v += (near * 0.9 - cm.v) * Math.min(1, dt * 6);
    bhUniforms.uCursor.value.set(cx * pr, cy * pr);
    bhUniforms.uCM.value = cm.v;

    draw();
    project();
    if (running) raf = requestAnimationFrame(frame);
  }

  function draw() {
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
      await idle();
      resize();
      try {
        await renderer.compileAsync(scene, camera);
      } catch {
        /* sem suporte: compila no render de aquecimento */
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
      /* 3. render de aquecimento (sobe buffers e render target para a GPU) */
      await idle();
      if (destroyed) return;
      resize();
      updateLines();
      draw();
      /* 4. todos os programas linkaram? Sem KHR_parallel_shader_compile é
       *    aqui que o link acontece: síncrono, mas um programa por idle e
       *    longe da seção. Erro de shader (comum em GPU de celular) vira
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
         * ao retomar o loop nada é realocado */
        resize();
        updateLines();
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
      pk.t = inside ? 1 : 0;
    },
    release() {
      if (rot.mode !== 1) return;
      /* dedo parado antes de soltar: sem inércia */
      if (performance.now() - rot.last > 80) rot.vy = rot.vp = 0;
      rot.mode = 2;
      rot.t = 0;
    },
    dragBy(dx, dy) {
      const now = performance.now();
      const dts = Math.max(0.008, Math.min(0.1, (now - (rot.mode === 1 ? rot.last : now - 16)) / 1000));
      rot.mode = 1;
      rot.last = now;
      const dyaw = (dx / Math.max(1, W)) * 2.2;
      const dp = (dy / Math.max(1, H)) * 1.2;
      rot.yaw += dyaw;
      rot.pitch += dp;
      /* velocidade para a inércia (média móvel, limitada) */
      rot.vy = Math.max(-3, Math.min(3, rot.vy * 0.5 + (dyaw / dts) * 0.5));
      rot.vp = Math.max(-1.5, Math.min(1.5, rot.vp * 0.5 + (dp / dts) * 0.5));
      clampRot();
    },
    setKeepOut(rects) {
      const same = rects.length === keep.length && rects.every((r, i) => ["x", "y", "w", "h"].every((k) => Math.abs(r[k as keyof Rect] - keep[i][k as keyof Rect]) < 1));
      if (same) return;
      keep = rects.slice(0, 4);
      reg = null; // força o resize a recalcular a região
      resize();
      updateLines();
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
      return {
        hole: { x: (bhNdc.x * 0.5 + 0.5) * W, y: (-bhNdc.y * 0.5 + 0.5) * H, r: DISK_RS * pxPerRs, ex: reg?.ex ?? 0, ey: reg?.ey ?? 0 },
        nodes: Array.from({ length: n }, (_, i) => ({ x: screen[i * 2], y: screen[i * 2 + 1] })),
        homes: reg?.homes.map((q) => ({ ...q })) ?? [],
        keep: keep.map((r) => ({ ...r })),
        margin: reg?.margin ?? 0,
        rot: { yaw: rot.yaw, pitch: rot.pitch, mode: rot.mode },
        w: W,
        h: H,
      };
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
      for (const d of [dustGeo, dustMat, lineGeo, lineMat, nodeGeo, nodeMat, quad, lensMat, simpleMat]) d.dispose();
      rt?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
