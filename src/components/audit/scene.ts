/*
 * Constelação do AUDIT (three.js). Carregado só quando a seção é a dona do
 * WebGL (lib/gl-slot), via import dinâmico.
 *
 * Performance:
 * - partículas num único THREE.Points; deriva, empurrão do cursor e onda de
 *   scan acontecem no vertex shader (a CPU nunca reescreve posições)
 * - por frame a CPU só integra 2 molas (cursor e intensidade), a rotação e
 *   projeta os ~10 nós principais (hover/cartão)
 * - DPR ≤ 1,5, sem antialias, loop parado quando a seção sai da tela ou a aba
 *   fica oculta (o componente chama run(false))
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";

import { CAMERA_Z, FOV, makeLayout } from "./layout";

const MAX_NODES = 12;

const DUST_VS = /* glsl */ `
attribute float aSeed;
attribute float aTone;
attribute float aSize;
uniform float uTime;
uniform float uPR;
uniform float uAspect;
uniform float uPush;
uniform float uScale;
uniform vec2 uMouse;
uniform vec3 uWave;   // xy: centro (NDC), z: raio
uniform float uWaveA; // intensidade da onda
varying float vA;
varying float vTone;
varying float vGlow;
void main() {
  vec3 p = position;
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

  // onda de scan: anel que se expande a partir do clique
  vec2 dw = ndc - uWave.xy;
  dw.x *= uAspect;
  float ring = abs(length(dw) - uWave.z);
  float glow = uWaveA * exp(-ring * ring / 0.0025);

  clip.xy = ndc * clip.w;
  gl_Position = clip;
  float tw = 0.75 + 0.25 * sin(uTime * 1.7 + aSeed * 40.0);
  vA = (0.36 + 0.24 * aTone) * tw + abs(push) * 0.5;
  vTone = aTone;
  vGlow = glow;
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
varying float vLit;
varying float vHover;
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
  gl_PointSize = uPR * (26.0 + 10.0 * lit + 14.0 * hov) * pulse * (${CAMERA_Z.toFixed(1)} / -mv.z);
}`;

const NODE_FS = /* glsl */ `
uniform vec3 uWhite;
uniform vec3 uAmber;
varying float vLit;
varying float vHover;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float halo = smoothstep(0.5, 0.0, r) * (0.28 + 0.3 * vLit + 0.25 * vHover);
  float core = smoothstep(0.13, 0.05, r);
  float ring = smoothstep(0.035, 0.0, abs(r - 0.21)) * (0.35 + 0.65 * max(vLit, vHover));
  vec3 c = mix(uAmber, uWhite, core * 0.7);
  gl_FragColor = vec4(c, min(1.0, halo + core + ring));
}`;

export type Constellation = {
  run(on: boolean): void;
  /** cursor em px relativos ao canvas; inside=false solta o campo (volta com mola) */
  pointer(x: number, y: number, inside: boolean): void;
  dragBy(dx: number, dy: number): void;
  /** índice do nó principal sob (x, y) em px, ou -1 */
  hit(x: number, y: number): number;
  /** posição em px do nó i (para o cartão) */
  nodeAt(i: number): { x: number; y: number };
  hover(i: number): void;
  /** onda de scan a partir de (x, y) px; acende os nós na ordem em que o anel os alcança */
  wave(x: number, y: number, onLit: (i: number) => void, onEnd: () => void): void;
  destroy(): void;
};

export function createConstellation(canvas: HTMLCanvasElement, nNodes: number, opts: { count: number; onLost(): void }): Constellation {
  const n = Math.min(nNodes, MAX_NODES);
  const L = makeLayout(n, opts.count);
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);

  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 2, 0.1, 50);
  camera.position.set(0, 0, CAMERA_Z);
  const group = new Group();
  scene.add(group);

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
      uMouse: { value: [9, 9] },
      uWave: { value: [0, 0, 0] },
      uWaveA: { value: 0 },
      uWhite: { value: white },
      uAmber: { value: amber },
    },
  });
  group.add(new Points(dustGeo, dustMat));

  /* linhas finas só entre nós principais */
  const seg = new Float32Array(L.links.length * 6);
  L.links.forEach(([i, j], k) => {
    seg.set(L.nodes.subarray(i * 3, i * 3 + 3), k * 6);
    seg.set(L.nodes.subarray(j * 3, j * 3 + 3), k * 6 + 3);
  });
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(seg, 3));
  const lineMat = new LineBasicMaterial({ color: 0xf5a524, transparent: true, opacity: 0.22, depthWrite: false });
  group.add(new LineSegments(lineGeo, lineMat));

  /* nós principais */
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
      uWhite: { value: white },
      uAmber: { value: amber },
    },
  });
  group.add(new Points(nodeGeo, nodeMat));

  /* ---------- estado ---------- */
  let W = 1;
  let H = 1;
  let running = false;
  let raf = 0;
  let last = performance.now();
  let time = 0;
  // mola do cursor (NDC) e da intensidade do empurrão: subamortecidas (passam um pouco e voltam)
  const m = { x: 9, y: 9, vx: 0, vy: 0, tx: 9, ty: 9 };
  const pk = { v: 0, p: 0, t: 0 };
  // rotação por arrasto, com inércia e um giro lento quando parado
  const rot = { x: 0.12, y: 0, vx: 0, vy: 0 };
  let dragging = 0;
  let dragTimer = 0;
  // onda
  let waveT = -1;
  let waveC = { x: 0, y: 0 };
  let waveMax = 0;
  let waveOrder: { i: number; d: number }[] = [];
  let waveLit: (i: number) => void = () => {};
  let waveEnd: () => void = () => {};

  const screen = new Float32Array(n * 2);
  const v = new Vector3();

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
    // a rede é ~2:1; em telas estreitas encolhe para caber
    const k = Math.min(1, Math.max(0.42, (w / h) / 1.9));
    group.scale.setScalar(k);
  }

  function project() {
    group.updateMatrixWorld();
    for (let i = 0; i < n; i++) {
      v.set(L.nodes[i * 3], L.nodes[i * 3 + 1], L.nodes[i * 3 + 2]).applyMatrix4(group.matrixWorld).project(camera);
      screen[i * 2] = (v.x * 0.5 + 0.5) * W;
      screen[i * 2 + 1] = (-v.y * 0.5 + 0.5) * H;
    }
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    resize();

    // molas
    const ax = 60 * (m.tx - m.x) - 9 * m.vx;
    const ay = 60 * (m.ty - m.y) - 9 * m.vy;
    m.vx += ax * dt;
    m.vy += ay * dt;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    const ap = 40 * (pk.t - pk.p) - 7 * pk.v;
    pk.v += ap * dt;
    pk.p += pk.v * dt;

    // rotação
    if (!dragging) {
      rot.vy += (0.04 - rot.vy) * Math.min(1, dt * 0.8);
      rot.vx *= Math.pow(0.05, dt);
      rot.x += (0.12 - rot.x) * Math.min(1, dt * 0.6);
    }
    rot.y += rot.vy * dt;
    rot.x = Math.max(-0.5, Math.min(0.5, rot.x + rot.vx * dt));
    group.rotation.set(rot.x, rot.y, 0);

    // onda
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
    u.uWave.value = [waveC.x, waveC.y, wr];
    u.uWaveA.value = wa;
    nodeMat.uniforms.uTime.value = time;

    renderer.render(scene, camera);
    project();
    if (running) raf = requestAnimationFrame(frame);
  }

  const toNdc = (x: number, y: number) => ({ x: (x / W) * 2 - 1, y: 1 - (y / H) * 2 });

  const onLost = (e: Event) => {
    e.preventDefault();
    running = false;
    cancelAnimationFrame(raf);
    opts.onLost();
  };
  canvas.addEventListener("webglcontextlost", onLost);

  resize();
  project();

  return {
    run(on) {
      if (on === running) return;
      running = on;
      if (on) {
        last = performance.now();
        if (!raf) raf = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    pointer(x, y, inside) {
      const p = toNdc(x, y);
      if (inside) {
        // primeira entrada: a mola parte do ponto (sem "voar" do canto)
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
      rot.vy = (dx / Math.max(1, W)) * 6 * 60 * 0.1;
      rot.vx = (dy / Math.max(1, H)) * 3 * 60 * 0.1;
      rot.y += (dx / Math.max(1, W)) * 3;
      rot.x = Math.max(-0.5, Math.min(0.5, rot.x + (dy / Math.max(1, H)) * 1.5));
      clearTimeout(dragTimer);
      dragTimer = window.setTimeout(() => (dragging = 0), 60);
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
    wave(x, y, onLit, onEnd) {
      const c = toNdc(x, y);
      const asp = W / H;
      waveC = c;
      lit.fill(0);
      waveOrder = Array.from({ length: n }, (_, i) => {
        const p = toNdc(screen[i * 2], screen[i * 2 + 1]);
        return { i, d: Math.hypot((p.x - c.x) * asp, p.y - c.y) };
      }).sort((a, b) => a.d - b.d);
      // o anel vai até cobrir a tela inteira a partir do clique
      waveMax = Math.max(...[-1, 1].flatMap((sx) => [-1, 1].map((sy) => Math.hypot((sx - c.x) * asp, sy - c.y)))) + 0.1;
      waveLit = onLit;
      waveEnd = onEnd;
      waveT = time;
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(dragTimer);
      canvas.removeEventListener("webglcontextlost", onLost);
      dustGeo.dispose();
      dustMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

