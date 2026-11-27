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
 * Níveis automáticos: mede o fps em janelas de 2 s e desce
 *   lente 1,0 → 0,75 → 0,5 (+ 65% das partículas) → simple
 *
 * Movimento: tudo no vertex shader (a CPU nunca reescreve partículas). Por
 * frame a CPU resolve Kepler para os ~10 nós, integra 2 molas e a rotação e
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

import { CAMERA_Z, DUST_TILT, FOV, HALF_H, makeLayout, orbitPos, type Layout } from "./layout";

const MAX_NODES = 12;
/* raio da sombra em rs (≈ 2,6 rs: 3√3/2) */
const SHADOW = 2.6;

const DUST_VS = /* glsl */ `
attribute vec4 aRef;   // tipo, i, j, t
attribute float aSeed;
attribute float aTone;
attribute float aSize;
uniform vec3 uNode[${MAX_NODES}];
uniform float uFade[${MAX_NODES}]; // 0 = nó apagado (sobre texto ou perto da borda)
uniform vec2 uRes2;     // campo (px CSS)
uniform vec4 uKeep[4];  // caixas de texto (px, origem em cima: x0, y0, x1, y1)
uniform float uTime;
uniform float uPR;
uniform float uAspect;
uniform float uPush;
uniform float uScale;
uniform float uHz;      // raio do horizonte (espaço local) onde a poeira some
uniform vec2 uMouse;
uniform vec3 uWave;     // xy: centro (NDC), z: raio
uniform float uWaveA;
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
    p = uNode[int(aRef.y + 0.5)] + position;
    fade = uFade[int(aRef.y + 0.5)]; // o aglomerado apaga com o nó
  } else if (aRef.x < 1.5) {
    p = mix(uNode[int(aRef.y + 0.5)], uNode[int(aRef.z + 0.5)], aRef.w) + position;
    fade = min(uFade[int(aRef.y + 0.5)], uFade[int(aRef.z + 0.5)]); // o filamento, com a linha
  } else if (aRef.x < 2.5) {
    // órbita (Kepler: ω ∝ r^-1.5)
    float r0 = position.x;
    float a = position.y + uTime * 0.2 * pow(r0, -1.5);
    p = tiltX(vec3(cos(a) * r0, sin(a) * r0, position.z));
  } else {
    // espiral: r = r0·√(1-f); o ângulo é a integral fechada de ω(r(t))
    float r0 = position.x, T = position.z;
    float f = fract(uTime / T + aSeed);
    float rr = r0 * sqrt(1.0 - f);
    float a = position.y + 0.8 * pow(r0, -1.5) * T * 4.0 * (1.0 - pow(1.0 - f, 0.25));
    p = tiltX(vec3(cos(a) * rr, sin(a) * rr, 0.0));
    fade = smoothstep(0.0, 0.06, f) * smoothstep(uHz * 1.05, uHz * 1.9, rr);
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
  /* nenhuma partícula sobre os textos nem a menos de 48 px das bordas */
  vec2 px = vec2(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5) * uRes2;
  float edge = min(min(px.y, uRes2.y - px.y), min(px.x, uRes2.x - px.x));
  fade *= smoothstep(24.0, 48.0, edge);
  for (int k = 0; k < 4; k++) {
    vec4 b = uKeep[k];
    float dk = max(max(b.x - px.x, px.x - b.z), max(b.y - px.y, px.y - b.w));
    fade *= smoothstep(0.0, 14.0, dk);
  }
  float tw = 0.75 + 0.25 * sin(uTime * 1.7 + aSeed * 40.0);
  vA = ((0.36 + 0.24 * aTone) * tw + abs(push) * 0.5) * fade;
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
uniform float uFade[${MAX_NODES}];
varying float vLit;
varying float vHover;
varying float vFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  int i = int(aIndex + 0.5);
  float lit = 0.0;
  for (int k = 0; k < ${MAX_NODES}; k++) if (k == i) lit = uLit[k];
  float hov = abs(aIndex - uHover) < 0.5 ? 1.0 : 0.0;
  float pulse = 0.9 + 0.1 * sin(uTime * 2.2 + aIndex * 1.7);
  vLit = lit;
  vHover = hov;
  vFade = uFade[i];
  gl_PointSize = uPR * (26.0 + 10.0 * lit + 14.0 * hov) * pulse * (${CAMERA_Z.toFixed(1)} / -mv.z);
}`;

const NODE_FS = /* glsl */ `
uniform vec3 uWhite;
uniform vec3 uAmber;
varying float vLit;
varying float vHover;
varying float vFade;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float halo = smoothstep(0.5, 0.0, r) * (0.28 + 0.3 * vLit + 0.25 * vHover);
  float core = smoothstep(0.13, 0.05, r);
  float ring = smoothstep(0.035, 0.0, abs(r - 0.21)) * (0.35 + 0.65 * max(vLit, vHover));
  vec3 c = mix(uAmber, uWhite, core * 0.7);
  gl_FragColor = vec4(c, min(1.0, halo + core + ring) * vFade);
}`;

/* ---------- buraco negro ---------- */
const BH_COMMON = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uBH;      // centro em px do drawing buffer (origem embaixo)
uniform float uScale;  // px por rs
uniform float uTime;
uniform float uIncl;   // elevação da câmera sobre o plano do disco (rad)
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
    vec3 dir = normalize(fwd + (p.x * vec3(1.0, 0.0, 0.0) + p.y * up) / D);
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
  vec2 p = (gl_FragCoord.xy - uBH) / uScale;
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
  // anel de fótons
  float ring = exp(-pow((r - ${SHADOW.toFixed(1)} - 0.06) / 0.07, 2.0));
  col += uWhite * ring * 0.8;
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
/* nível escolhido: vale para a sessão (a cena é criada uma vez e só pausa) */
let chosen: { level: number; why: string } | null = null;

export type Constellation = {
  run(on: boolean): void;
  pointer(x: number, y: number, inside: boolean): void;
  dragBy(dx: number, dy: number): void;
  /** caixas de texto por cima do campo (px do campo): o giro não leva nenhum nó para cima delas */
  setKeepOut(rects: { x: number; y: number; w: number; h: number }[]): void;
  hit(x: number, y: number): number;
  nodeAt(i: number): { x: number; y: number };
  hover(i: number): void;
  /** onda de scan saindo do horizonte; acende os nós na ordem em que o anel os alcança */
  wave(onLit: (i: number) => void, onEnd: () => void): void;
  /** compila os shaders e desenha um quadro fora da tela, em pedaços ociosos (sem nada síncrono na entrada) */
  warm(): Promise<void>;
  /** escolhe o nível de qualidade (uma vez por sessão; ajusta o buffer e desenha um quadro nele) */
  choose(): { quality: string; why: string };
  /** testes (?auditdebug): buraco negro, nós na tela, centróide da rede e rotação */
  debug(): { hole: { x: number; y: number }; nodes: { x: number; y: number }[]; rot: { x: number; y: number }; keep: { x: number; y: number; w: number; h: number }[]; margin: number; bad: number; badRest: number; w: number; h: number };
  /** testes: arrasta como o mouse arrastaria (dx, dy em px) e solta */
  debugDrag(dx: number, dy: number): void;
  destroy(): void;
};

export function createConstellation(
  canvas: HTMLCanvasElement,
  nNodes: number,
  opts: { count: number; simple: boolean; layout?: Layout; keep?: { x: number; y: number; w: number; h: number }[]; onLost(): void },
): Constellation {
  const n = Math.min(nNodes, MAX_NODES);
  /* posições prontas do Worker (layout.worker); sem ele, o mesmo cálculo aqui */
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

  /* nós: posições atualizadas por frame (Kepler na CPU) */
  const nodePos = new Float32Array(n * 3);
  const nodeVec = Array.from({ length: MAX_NODES }, () => new Vector3());
  const tmp = [0, 0, 0];
  const updateNodes = (t: number) => {
    for (let i = 0; i < n; i++) {
      orbitPos(L.orbits[i], t, tmp);
      nodePos.set(tmp, i * 3);
      nodeVec[i].set(tmp[0], tmp[1], tmp[2]);
    }
  };
  updateNodes(0);
  /* apagamento por nó (0..1), suave (~300 ms): sobre texto ou perto da borda */
  const fade = new Array(MAX_NODES).fill(1);
  let fadeInit = false;

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
      uFade: { value: fade },
      uRes2: { value: new Vector2(1, 1) },
      uKeep: { value: Array.from({ length: 4 }, () => new Vector4(-1e5, -1e5, -1e5, -1e5)) },
      uTime: { value: 0 },
      uPR: { value: dpr },
      uAspect: { value: 2 },
      uPush: { value: 0 },
      uScale: { value: 15 },
      uHz: { value: 0.33 },
      uMouse: { value: [9, 9] },
      uWave: { value: [0, 0, 0] },
      uWaveA: { value: 0 },
      uWhite: { value: white },
      uAmber: { value: amber },
    },
  });
  const dust = new Points(dustGeo, dustMat);
  dust.frustumCulled = false; // posições saem do shader
  group.add(dust);

  /* linhas: todos os pares, brilho pela distância (sem trocas bruscas enquanto orbitam) */
  const pairs: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
  const seg = new Float32Array(pairs.length * 6);
  const segCol = new Float32Array(pairs.length * 6);
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(seg, 3));
  lineGeo.setAttribute("color", new BufferAttribute(segCol, 3));
  const lineMat = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const lines = new LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  group.add(lines);
  const updateLines = () => {
    pairs.forEach(([i, j], k) => {
      seg.set(nodePos.subarray(i * 3, i * 3 + 3), k * 6);
      seg.set(nodePos.subarray(j * 3, j * 3 + 3), k * 6 + 3);
      const d = Math.hypot(nodePos[i * 3] - nodePos[j * 3], nodePos[i * 3 + 1] - nodePos[j * 3 + 1], nodePos[i * 3 + 2] - nodePos[j * 3 + 2]);
      const t = Math.max(0, Math.min(1, (2.0 - d) / 0.9));
      const v = 0.22 * t * t * (3 - 2 * t) * Math.min(fade[i], fade[j]);
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
      uFade: { value: fade },
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
   * Giro (o do commit 76d962c: em volta do buraco negro, a rede orbita ao
   * arrastar, com a mesma sensibilidade e os mesmos tetos ±0,9 / ±0,5 rad).
   * Mais: o arraste só vai até onde nenhum nó sai da área segura (SAFE px
   * das bordas) nem entra nas caixas de texto — calculado com as posições
   * reais dos nós. Sem mola: solto, fica onde parou; 6 s sem interação →
   * volta à pose original em ~2 s.
   */
  const rot = { x: 0, y: 0, z: 0 };
  let dragging = 0;
  let dragTimer = 0;
  let lastDrag = -1e9; // performance.now() do último arraste
  const ret = { t0: -1, x0: 0, y0: 0 }; // volta à pose original
  const SAFE = 48;
  const NODE_R = 12; // folga do halo do nó (px)
  let keep = (opts.keep ?? []).slice(0, 4);
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
  /* sem benchmark: o nível vem de choose(); depois de visível só desce
   * (fps < 40 por mais de 2 s, janelas de 0,5 s → um degrau) */
  const watch = { t0: -1, frames: 0, slow: -1 };
  function applyQuality() {
    quality = LADDER[level];
    canvas.dataset.quality = quality;
    const q = quality === "lens-0.75" ? 0.75 : quality === "lens-0.5" ? 0.5 : 1;
    renderer.setPixelRatio(dpr * q);
    /* níveis baixos desenham menos, mas nunca menos de ~1.500 */
    dustGeo.setDrawRange(0, level >= 2 ? Math.max(Math.min(L.count, 1500), Math.floor(L.count * 0.65)) : L.count);
    post.material = quality === "simple" ? simpleMat : lensMat;
    /* sem lente a cena vai direto para o canvas: fundo opaco (linhas aditivas não "furam" o fundo) */
    renderer.setClearColor(quality === "simple" ? 0x0b0d10 : 0x000000, quality === "simple" ? 1 : 0);
    if (quality === "simple") {
      rt?.dispose();
      rt = null;
    }
    W = H = -1; // força o resize
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    if (w === W && h === H) return;
    W = w;
    H = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dustMat.uniforms.uAspect.value = w / h;
    dustMat.uniforms.uRes2.value.set(w, h);
    const asp = w / h;
    const narrow = asp < 0.9;
    /* desktop: buraco negro no terço esquerdo; telas estreitas: no topo, menor */
    bhNdc.x = narrow ? 0 : -0.5;
    bhNdc.y = narrow ? 0.42 : 0;
    pxPerRs = narrow ? w * 0.026 : Math.min(h * 0.026, w * 0.018);
    base.set(bhNdc.x * HALF_H * asp, bhNdc.y * HALF_H, 0);
    rot.z = narrow ? -Math.PI / 2 : 0;
    /* a constelação abre para o lado livre: cabe na largura (desktop) ou na altura (celular) */
    const room = narrow ? (bhNdc.y + 0.55) * HALF_H : 1.45 * HALF_H * asp;
    const k = Math.min(1, room / 5.4);
    group.scale.setScalar(k);
    orient();
    const worldPerPx = (2 * HALF_H) / h;
    dustMat.uniforms.uHz.value = (SHADOW * pxPerRs * worldPerPx) / k;
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

  const base = new Vector3();
  function orient() {
    group.position.copy(base);
    group.rotation.set(rot.x, rot.y, rot.z);
  }
  /* quanto (px) os nós invadem a área proibida na pose (rx, ry), com as
   * posições ATUAIS dos nós: bordas (SAFE px) e caixas de texto */
  function badness(rx: number, ry: number) {
    group.position.copy(base);
    group.rotation.set(rx, ry, rot.z);
    group.updateMatrixWorld();
    let bad = 0;
    for (let i = 0; i < n; i++) {
      v.set(nodePos[i * 3], nodePos[i * 3 + 1], nodePos[i * 3 + 2]).applyMatrix4(group.matrixWorld).project(camera);
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      const m0 = SAFE + NODE_R;
      bad += Math.max(0, m0 - x) + Math.max(0, x - (W - m0)) + Math.max(0, m0 - y) + Math.max(0, y - (H - m0));
      for (const k of keep) {
        const inX = Math.min(x - (k.x - NODE_R), k.x + k.w + NODE_R - x);
        const inY = Math.min(y - (k.y - NODE_R), k.y + k.h + NODE_R - y);
        if (inX > 0 && inY > 0) bad += Math.min(inX, inY);
      }
    }
    orient();
    group.updateMatrixWorld();
    return bad;
  }
  /* uma pose vale se não piora em relação à atual nem à original (se a pose
   * original já encosta em algo, o arraste não pode piorar isso) */
  const okPose = (rx: number, ry: number, limit: number) => badness(rx, ry) <= limit + 0.5;
  /* move de (rot.x, rot.y) para (tx, ty) até onde a pose continua valendo:
   * tenta o passo inteiro, depois cada eixo, depois a maior fração (bissecção) */
  function stepTo(tx: number, ty: number) {
    const limit = Math.max(badness(rot.x, rot.y), badness(0, 0));
    if (okPose(tx, ty, limit)) return void ((rot.x = tx), (rot.y = ty));
    if (okPose(rot.x, ty, limit)) rot.y = ty;
    else if (okPose(tx, rot.y, limit)) rot.x = tx;
    else {
      let lo = 0, hi = 1;
      for (let k = 0; k < 6; k++) {
        const mid = (lo + hi) / 2;
        if (okPose(rot.x + (tx - rot.x) * mid, rot.y + (ty - rot.y) * mid, limit)) lo = mid;
        else hi = mid;
      }
      rot.x += (tx - rot.x) * lo;
      rot.y += (ty - rot.y) * lo;
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
    const real = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, real); // molas e física: passo limitado
    last = now;
    /* órbitas e rotação no ritmo do relógio, mesmo com poucos fps (celular):
     * só uma pausa longa (aba em segundo plano) não conta */
    time += Math.min(0.25, real);

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
            if (chosen) chosen.level = level;
            watch.slow = -1;
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

    updateNodes(time);
    /* solto: fica onde parou; depois de 6 s sem interação, volta à pose
     * original em ~2 s (suave nas duas pontas) */
    if (!dragging && (rot.x || rot.y)) {
      if (ret.t0 < 0 && now - lastDrag > 6000) {
        ret.t0 = now;
        ret.x0 = rot.x;
        ret.y0 = rot.y;
      }
      if (ret.t0 >= 0) {
        const e = Math.min(1, (now - ret.t0) / 2000);
        const s = 1 - e * e * (3 - 2 * e);
        rot.x = ret.x0 * s;
        rot.y = ret.y0 * s;
        if (e >= 1) ret.t0 = -1;
      } else if (badness(rot.x, rot.y) > badness(0, 0) + 0.5) {
        /* parada fora da pose original, as órbitas levaram um nó para a área
         * proibida: recua um pouco para a pose original até sair dela */
        rot.x *= 0.96;
        rot.y *= 0.96;
      }
    }
    orient();
    nodeGeo.attributes.position.needsUpdate = true;

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

    /* buraco negro: disco fixo (não inclina com o arraste); o cursor perto pesa na lente */
    bhUniforms.uTime.value = time;
    const pr = bhUniforms.uRes.value.x / W;
    const cx = (m.x * 0.5 + 0.5) * W, cy = (m.y * 0.5 + 0.5) * H;
    const bx = (bhNdc.x * 0.5 + 0.5) * W, by = (bhNdc.y * 0.5 + 0.5) * H;
    const dRs = Math.hypot(cx - bx, cy - by) / pxPerRs;
    const near = Math.max(0, Math.min(1, (18 - dRs) / 10)) * Math.max(0, pk.p);
    cm.v += (near * 0.9 - cm.v) * Math.min(1, dt * 6);
    bhUniforms.uCursor.value.set(cx * pr, cy * pr);
    bhUniforms.uCM.value = cm.v;

    project();
    updateFade(dt);
    updateLines();
    draw();
    if (running) raf = requestAnimationFrame(frame);
  }

  /* nó sobre o título, a lede ou a coluna (caixas reais do DOM, com a folga
   * do halo) ou a menos de 48 px das bordas: apaga em ~300 ms; ao sair, volta */
  function updateFade(dt: number) {
    for (let i = 0; i < n; i++) {
      const x = screen[i * 2], y = screen[i * 2 + 1];
      let hide = y < SAFE || y > H - SAFE || x < SAFE || x > W - SAFE;
      for (const k of keep) if (x > k.x - NODE_R && x < k.x + k.w + NODE_R && y > k.y - NODE_R && y < k.y + k.h + NODE_R) hide = true;
      const target = hide ? 0 : 1;
      fade[i] = fadeInit ? (target > fade[i] ? Math.min(target, fade[i] + dt / 0.3) : Math.max(target, fade[i] - dt / 0.3)) : target;
    }
    fadeInit = true;
  }
  function keepUniforms() {
    const kb = dustMat.uniforms.uKeep.value as Vector4[];
    kb.forEach((b, i) => {
      const r = keep[i];
      if (r) b.set(r.x - 6, r.y - 6, r.x + r.w + 6, r.y + r.h + 6);
      else b.set(-1e5, -1e5, -1e5, -1e5);
    });
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
  keepUniforms();
  project();
  updateFade(0);
  updateLines();

  const idle = () =>
    new Promise<void>((r) => ("requestIdleCallback" in window ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));

  return {
    async warm() {
      /* 1. um programa por idle (poeira, linhas, nós): cada envio de shader
       *    custa ~15–25 ms com CPU 4× */
      for (const obj of group.children) {
        await idle();
        if (destroyed) return;
        resize();
        try {
          await renderer.compileAsync(obj, camera, scene);
        } catch {
          /* sem suporte: compila no render de aquecimento */
        }
      }
      /* 2. os dois passes finais (lente e simple): a queda de qualidade pode trocar */
      for (const mat of opts.simple ? [simpleMat] : [lensMat, simpleMat]) {
        await idle();
        if (destroyed) return;
        post.material = mat;
        try {
          await renderer.compileAsync(postScene, postCam);
        } catch {
          /* idem */
        }
      }
      post.material = quality === "simple" ? simpleMat : lensMat;
      /* 3. quadro fora da tela (sobe buffers e render target para a GPU) */
      await idle();
      if (destroyed) return;
      resize();
      draw();
      project();
      /* 4. todos os programas linkaram? Erro vira exceção: o componente cai
       *    na imagem estática em vez de um canvas vazio */
      const gl = renderer.getContext();
      type Prog = { program: WebGLProgram; name?: string };
      for (const p of (renderer.info.programs ?? []) as unknown as Prog[]) {
        await idle();
        if (destroyed) return;
        if (gl.isContextLost()) throw new Error("contexto perdido durante o aquecimento");
        if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) throw new Error(`shader ${p.name || "?"}: ${(gl.getProgramInfoLog(p.program) || "link falhou").slice(0, 300)}`);
      }
    },
    choose() {
      if (!chosen) chosen = pickLevel(renderer.getContext(), opts.simple);
      if (chosen.level !== level) {
        level = chosen.level;
        applyQuality();
        resize();
        draw();
      }
      canvas.dataset.qualityWhy = chosen.why;
      return { quality, why: chosen.why };
    },
    debug() {
      project();
      return {
        hole: { x: (bhNdc.x * 0.5 + 0.5) * W, y: (-bhNdc.y * 0.5 + 0.5) * H },
        nodes: Array.from({ length: n }, (_, i) => ({ x: screen[i * 2], y: screen[i * 2 + 1] })),
        rot: { x: rot.x, y: rot.y },
        keep: keep.map((k) => ({ ...k })),
        margin: SAFE,
        bad: badness(rot.x, rot.y),
        badRest: badness(0, 0),
        w: W,
        h: H,
      };
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
    dragBy(dx, dy) {
      dragging = 1;
      lastDrag = performance.now();
      ret.t0 = -1; // mexeu: cancela a volta
      /* a mesma sensibilidade e os mesmos tetos do commit 76d962c; o resto
       * do limite vem das posições reais dos nós (stepTo) */
      const ty = Math.max(-0.9, Math.min(0.9, rot.y + (dx / Math.max(1, W)) * 3));
      const tx = Math.max(-0.5, Math.min(0.5, rot.x + (dy / Math.max(1, H)) * 1.5));
      stepTo(tx, ty);
      orient();
      project();
      clearTimeout(dragTimer);
      dragTimer = window.setTimeout(() => {
        dragging = 0;
        lastDrag = performance.now();
      }, 60);
    },
    setKeepOut(rects) {
      keep = rects.slice(0, 4);
      keepUniforms();
    },
    debugDrag(dx, dy) {
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
      for (let k = 0; k < steps; k++) this.dragBy(dx / steps, dy / steps);
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
      clearTimeout(dragTimer);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const d of [dustGeo, dustMat, lineGeo, lineMat, nodeGeo, nodeMat, quad, lensMat, simpleMat]) d.dispose();
      rt?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
