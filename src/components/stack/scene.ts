/*
 * STACK: logos da stack como fichas 3D "de geleia".
 *
 * three.js puro, sem lib de física. Este módulo inteiro só é baixado quando a
 * seção se aproxima (import dinâmico em StackStage).
 *
 *   ficha  = moeda low-poly (lathe, borda arredondada) + logo extrudado (SVG
 *            do simple-icons com bevel pequeno) por cima
 *   física = 2D no plano da mesa, implementação própria: cada peça é um
 *            círculo (x, z), colisão círculo-círculo e paredes invisíveis nas
 *            bordas visíveis do canvas (recalculadas no resize). Passo fixo de
 *            1/60 s, damping forte, restituição 0.3, velocidade limitada e
 *            peças que dormem paradas. Rotação só no eixo vertical (moedas
 *            deslizando): nada tomba, nada gira sozinho, nada sai da mesa
 *   queda  = animação (tween com bounce), uma peça depois da outra; não é física
 *   geleia = mola amortecida por ficha: no impacto (colisão, parede, fim da
 *            queda) achata no eixo da batida e estica no perpendicular
 *   mouse  = arrastar move a peça (que empurra as outras); soltar com
 *            velocidade = arremesso; clique sem mover (< 5 px) abre o popup.
 *            O cursor sem arrastar não empurra nada
 *   luz    = RoomEnvironment (PMREM, gerado uma vez) + 1 direcional com
 *            shadow map (1024). Só as fichas projetam sombra e só o chão
 *            (ShadowMaterial transparente) recebe: a sombra existe apenas onde
 *            há peça
 *   foco   = clicar numa peça: ela voa (~500 ms) até a frente da câmera,
 *            cresce, flutua e gira devagar; um véu cor de papel apaga as
 *            outras. Ao fechar, volta para o lugar dela na mesa.
 * Renderiza sob demanda: com tudo parado, o loop para até o próximo evento.
 */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

export type Token = { id: string; name: string; path: string; hex: string };
export type SceneEvents = {
  hover: (name: string | null, x: number, y: number) => void;
  select: (id: string) => void;
  /** clique no canvas com uma peça em foco = clique fora do painel */
  close: () => void;
};

const R = 1; // raio da ficha
const T = 0.38; // espessura
const LOGO = 1.15; // largura do logo (unidades do mundo)
const PAPER = new Color("#efe9dc");
const INK = new Color("#1b1916");
const WARM = new Color("#e9a640");
/* física 2D no plano da mesa (x, z) */
const STEP = 1 / 60; // passo fixo
const DAMP = 2.6; // damping linear forte (1/s): uma peça solta para em ~1 s
const SPIN_DAMP = 3.2; // damping da rotação em torno do eixo vertical
const RESTITUTION = 0.3;
const MAX_SPEED = 12; // velocidade máxima de qualquer peça (unidades/s)
const MAX_SPIN = 6; // rad/s
const SLEEP_SPEED = 0.06;
const SLEEP_TIME = 0.4; // s quase parada → dorme
const CLICK_PX = 5; // até isso de movimento entre down e up = clique
const LIFT = 0.35; // altura da peça na mão (só visual: a sombra se afasta)
/* queda inicial: tween com bounce, uma peça depois da outra */
const DROP_H = 4.5;
/* acima disso a peça não projeta sombra (nada de sombra sem peça à vista) */
const SHADOW_Y = 2;
const DROP_MS = 750;
/* índice → 3D */
const DIM_COLOR = new Color("#2b2620");
const DIM_MIX = 0.62; // quanto a moeda fora da categoria escurece
const DIM_SINK = 0.24; // e quanto afunda
const HOP_MS = 460;
const HOP_H = 0.95;
const DROP_GAP = 85;

/* moeda com borda arredondada (perfil girado em torno de Y) */
function coinGeometry() {
  const r = 0.1;
  const pts: Vector2[] = [new Vector2(0, -T / 2)];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 3; i++) {
      const a = a0 + ((a1 - a0) * i) / 3;
      pts.push(new Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  };
  arc(R - r, -T / 2 + r, -Math.PI / 2, 0);
  arc(R - r, T / 2 - r, 0, Math.PI / 2);
  pts.push(new Vector2(0, T / 2));
  return new LatheGeometry(pts, 28);
}

/* SVG 24×24 → logo extrudado deitado no topo da ficha (y para cima) */
function logoGeometry(path: string): BufferGeometry | null {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path transform="translate(-12 12) scale(1 -1)" d="${path}"/></svg>`;
  const shapes = new SVGLoader().parse(svg).paths.flatMap((p) => p.toShapes());
  if (!shapes.length) return null;
  const g = new ExtrudeGeometry(shapes, {
    depth: 1.1,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.22,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.rotateX(-Math.PI / 2);
  const s = LOGO / 24;
  g.scale(s, s, s);
  g.translate(0, T / 2 - 0.01, 0);
  g.computeVertexNormals();
  return g;
}

/* cor da marca dessaturada e puxada para o quente */
function tone(hex: string) {
  const c = new Color(`#${hex}`);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.s < 0.08) return hsl.l < 0.5 ? INK.clone() : PAPER.clone();
  c.setHSL(hsl.h, hsl.s * 0.62, Math.min(0.6, Math.max(0.36, hsl.l)));
  return c.lerp(WARM, 0.14);
}
const lum = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

type State = "hidden" | "falling" | "table" | "drag" | "focus" | "returning";
type Piece = {
  token: Token;
  group: Group;
  hit: Mesh;
  state: State;
  /* física 2D */
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  w: number;
  rest: number; // tempo quase parada (s)
  asleep: boolean;
  y: number; // só visual (queda, peça na mão)
  /* queda */
  t0: number;
  yaw0: number;
  landed: boolean;
  /* destaque por categoria: 0 = normal, 1 = apagada (escura e afundada) */
  dim: number;
  dimT: number;
  /* pulo (índice → moeda): início em ms, 0 = parado */
  hop: number;
  oy: number; // deslocamento vertical só visual (afundar + pulo)
  body: MeshPhysicalMaterial;
  logo: MeshPhysicalMaterial;
  base: Color;
  logoBase: Color;
  /* mola da geleia: x = achatamento no eixo n (frame local da peça) */
  sx: number;
  sv: number;
  n: Vector3;
};

/* cede a main thread entre blocos de trabalho pesado (montagem em pedaços) */
const yieldMain = () =>
  new Promise<void>((r) => {
    const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (s?.yield) void s.yield().then(r);
    else setTimeout(r, 0);
  });

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/* bounce clássico (easeOutBounce) */
function bounce(t: number) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

export async function createStackScene(canvas: HTMLCanvasElement, tokens: Token[], on: SceneEvents) {
  const box = canvas.parentElement!;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: dpr < 1.3, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  /* sombra real: PCF com radius (o PCFSoftShadowMap foi removido do three
   * r18x; ele avisa e cai para PCF). Só as peças projetam, só o chão recebe. */
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();
  await yieldMain();
  const sun = new DirectionalLight(0xfff1dc, 1.4);
  sun.position.set(-5, 9, 6.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  /* chão: invisível, só recebe sombra (a sombra existe apenas onde há peça) */
  const floorMat = new ShadowMaterial({ color: new Color("#2a2015"), opacity: 0.3, depthWrite: false });
  const floorMesh = new Mesh(new PlaneGeometry(60, 60), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  const camera = new PerspectiveCamera(30, 1, 1, 80);
  camera.position.set(0, 19, 11);
  camera.lookAt(0, 0, 0.4);

  /* paredes invisíveis nas bordas visíveis do canvas (recalculadas no resize) */
  const bounds = { x: 6, z0: -4, z1: 4 };

  /* ---------- fichas ---------- */
  const coin = coinGeometry();
  const disposables: { dispose(): void }[] = [coin, envRT, floorMat, floorMesh.geometry];

  const build = (token: Token): Piece => {
    const base = tone(token.hex);
    const bodyMat = new MeshPhysicalMaterial({
      color: base.clone(),
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      sheen: 0.35,
      sheenRoughness: 0.5,
      sheenColor: new Color("#ffc779"),
    });
    const logoBase = (lum(base) < 0.16 ? PAPER : INK).clone();
    const logoMat = new MeshPhysicalMaterial({
      color: logoBase.clone(),
      roughness: 0.4,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
    });
    const group = new Group();
    group.matrixAutoUpdate = false;
    group.visible = false;
    const hit = new Mesh(coin, bodyMat);
    hit.castShadow = true;
    group.add(hit);
    const lg = logoGeometry(token.path);
    if (lg) {
      const top = new Mesh(lg, logoMat);
      top.castShadow = true;
      group.add(top);
      disposables.push(lg);
    }
    scene.add(group);
    disposables.push(bodyMat, logoMat);
    const piece: Piece = {
      token, group, hit, state: "hidden",
      x: 0, z: 0, vx: 0, vz: 0, yaw: 0, w: 0, rest: 0, asleep: true, y: 0,
      t0: 0, yaw0: 0, landed: false,
      dim: 0, dimT: 0, hop: 0, oy: 0, body: bodyMat, logo: logoMat, base, logoBase,
      sx: 0, sv: 0, n: new Vector3(0, 1, 0),
    };
    hit.userData.piece = piece;
    return piece;
  };
  /* extrusão dos logos: 3 por vez, devolvendo a thread entre os blocos */
  const pieces: Piece[] = [];
  for (let i = 0; i < tokens.length; i++) {
    pieces.push(build(tokens[i]));
    if (i % 3 === 2) await yieldMain();
  }

  /* véu: plano de papel entre a mesa e a peça em foco (sem 2º contexto) */
  const veilMat = new MeshBasicMaterial({ color: new Color("#e9e7e2"), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const veil = new Mesh(new PlaneGeometry(400, 400), veilMat);
  veil.visible = false;
  veil.renderOrder = 5;
  scene.add(veil);
  disposables.push(veilMat, veil.geometry);

  /* geleia: chute na mola com a normal do impacto (mundo → frame da peça) */
  const squash = (p: Piece, nx: number, ny: number, nz: number, amount: number) => {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    p.n.set(nx * c - nz * s, ny, nx * s + nz * c).normalize();
    p.sv += Math.min(amount, 6);
  };
  const wakeP = (p: Piece) => {
    p.asleep = false;
    p.rest = 0;
  };

  /* ---------- física 2D ---------- */
  const onTable = (p: Piece) => p.state === "table" || p.state === "drag";
  function step(dt: number) {
    const live = pieces.filter(onTable);
    const kd = Math.exp(-DAMP * dt), ks = Math.exp(-SPIN_DAMP * dt);
    for (const p of live) {
      if (p.state === "drag" || p.asleep) continue;
      p.vx *= kd;
      p.vz *= kd;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > MAX_SPEED) {
        p.vx *= MAX_SPEED / sp;
        p.vz *= MAX_SPEED / sp;
      }
      p.w = clamp(p.w * ks, -MAX_SPIN, MAX_SPIN);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.yaw += p.w * dt;
    }
    /* colisão círculo-círculo: itera até a maior sobreposição ficar abaixo de
     * 0.02 (no máximo 24 vezes). A peça na mão é ~7× mais pesada: empurra as
     * outras, mas cede quando uma delas está presa na parede */
    for (let it = 0, worst = 1; it < 24 && worst > 0.02; it++) {
      worst = 0;
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i], b = live[j];
          const dx = b.x - a.x, dz = b.z - a.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= 4 * R * R) continue;
          const d = Math.sqrt(d2);
          /* centros coincidentes: separa no eixo x */
          const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
          const ia = a.state === "drag" ? 0.15 : 1, ib = b.state === "drag" ? 0.15 : 1;
          const pen = 2 * R - d;
          /* duas dormindo só acordam se de fato se sobrepõem */
          if (a.asleep && b.asleep && pen < 0.02) continue;
          worst = Math.max(worst, pen);
          a.x -= nx * pen * (ia / (ia + ib));
          a.z -= nz * pen * (ia / (ia + ib));
          b.x += nx * pen * (ib / (ia + ib));
          b.z += nz * pen * (ib / (ia + ib));
          const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
          const vn = rvx * nx + rvz * nz;
          if (vn < 0 && it === 0) {
            const jn = (-(1 + RESTITUTION) * vn) / (ia + ib);
            a.vx -= jn * nx * ia;
            a.vz -= jn * nz * ia;
            b.vx += jn * nx * ib;
            b.vz += jn * nz * ib;
            /* atrito na borda: gira um pouco (só no eixo vertical) */
            const vt = rvx * -nz + rvz * nx;
            a.w += vt * 0.25 * ia;
            b.w -= vt * 0.25 * ib;
            if (-vn > 1.2) {
              squash(a, nx, 0, nz, -vn * 0.5 * ia);
              squash(b, nx, 0, nz, -vn * 0.5 * ib);
            }
          }
          wakeP(a);
          wakeP(b);
        }
      }
      /* paredes: rebate com a mesma restituição */
      for (const p of live) {
        const hitWall = (axis: "x" | "z", lim: number, sign: number) => {
          const v = axis === "x" ? p.vx : p.vz;
          if (axis === "x") p.x = lim;
          else p.z = lim;
          if (v * sign > 0) {
            if (axis === "x") p.vx = -v * RESTITUTION;
            else p.vz = -v * RESTITUTION;
            if (Math.abs(v) > 1.2) squash(p, axis === "x" ? sign : 0, 0, axis === "z" ? sign : 0, Math.abs(v) * 0.5);
          }
        };
        if (p.x < -bounds.x + R) hitWall("x", -bounds.x + R, -1);
        if (p.x > bounds.x - R) hitWall("x", bounds.x - R, 1);
        if (p.z < bounds.z0 + R) hitWall("z", bounds.z0 + R, -1);
        if (p.z > bounds.z1 - R) hitWall("z", bounds.z1 - R, 1);
      }
    }
    /* limites depois dos impulsos: nenhuma peça passa da velocidade nem do giro máximos */
    for (const p of live) {
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > MAX_SPEED) {
        p.vx *= MAX_SPEED / sp;
        p.vz *= MAX_SPEED / sp;
      }
      p.w = clamp(p.w, -MAX_SPIN, MAX_SPIN);
    }
    /* dormir quando quase parada */
    for (const p of live) {
      if (p.state === "drag" || p.asleep) continue;
      if (Math.hypot(p.vx, p.vz) < SLEEP_SPEED && Math.abs(p.w) < 0.08) {
        p.rest += dt;
        if (p.rest > SLEEP_TIME) {
          p.asleep = true;
          p.vx = p.vz = p.w = 0;
        }
      } else p.rest = 0;
    }
  }

  /* ---------- tamanho / paredes ---------- */
  const ray = new Raycaster();
  const ndc = new Vector2();
  const hitPt = new Vector3();
  const onPlane = (nx: number, ny: number, y: number) => {
    ndc.set(nx, ny);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), hitPt) ? hitPt.clone() : null;
  };

  let W = 1, H = 1;
  const resize = () => {
    W = box.clientWidth;
    H = box.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    /* telas estreitas: afasta a câmera para caber a largura mínima da mesa */
    const dist = W / H < 0.9 ? 1.55 : W / H < 1.3 ? 1.2 : 1;
    camera.position.set(0, 19 * dist, 11 * dist);
    camera.lookAt(0, 0, 0.4);
    camera.updateProjectionMatrix();
    /* paredes nas bordas VISÍVEIS da mesa (frustum medido no chão e na
     * altura da peça na mão; usa o mais apertado de cada lado) */
    const at = (y: number) => {
      const bl = onPlane(-1, -1, y), tl = onPlane(-1, 1, y);
      return bl && tl ? { x: Math.abs(bl.x), z1: bl.z, z0: tl.z } : null;
    };
    const a0 = at(0), a1 = at(T + LIFT);
    if (a0 && a1) {
      bounds.x = Math.min(a0.x, a1.x) - 0.1;
      bounds.z1 = Math.min(a0.z1, a1.z1) - 0.15;
      bounds.z0 = Math.max(a0.z0, a1.z0) + 0.15;
    }
    /* frustum da sombra cobrindo a mesa */
    const sc = sun.shadow.camera;
    const span = Math.max(bounds.x, Math.abs(bounds.z0), Math.abs(bounds.z1)) + 2;
    sc.left = -span;
    sc.right = span;
    sc.top = span;
    sc.bottom = -span;
    sc.updateProjectionMatrix();
    for (const p of pieces) {
      if (!onTable(p)) continue;
      p.x = clamp(p.x, -bounds.x + R, bounds.x - R);
      p.z = clamp(p.z, bounds.z0 + R, bounds.z1 - R);
      wakeP(p);
    }
    wake();
  };

  /* ---------- queda (animação, não física) ---------- */
  /* posições finais sem sobreposição (amostragem com rejeição; se faltar
   * espaço, a física separa na chegada) */
  const spots = () => {
    const out: { x: number; z: number }[] = [];
    const ok = (x: number, z: number, m: number) => out.every((o) => Math.hypot(o.x - x, o.z - z) >= m);
    for (let i = 0; i < pieces.length; i++) {
      let best = { x: 0, z: 0 };
      for (let k = 0; k < 120; k++) {
        const x = (Math.random() * 2 - 1) * (bounds.x - R);
        const z = bounds.z0 + R + Math.random() * (bounds.z1 - bounds.z0 - 2 * R);
        best = { x, z };
        if (ok(x, z, 2 * R + 0.25)) break;
      }
      out.push(best);
    }
    return out;
  };
  let dropped = false;
  let dropEnd = 0;
  const drop = () => {
    if (dropped) return;
    dropped = true;
    const now = performance.now();
    const pts = spots();
    pieces.forEach((p, i) => {
      if (p.state !== "hidden") return;
      p.state = "falling";
      p.x = pts[i].x;
      p.z = pts[i].z;
      p.vx = p.vz = p.w = 0;
      p.yaw = (Math.random() - 0.5) * 0.9;
      p.yaw0 = p.yaw + (Math.random() - 0.5) * 2.4;
      p.t0 = now + i * DROP_GAP;
      p.landed = false;
      p.y = DROP_H;
      castShadow(p, false);
      p.group.visible = true;
    });
    dropEnd = now + pieces.length * DROP_GAP + DROP_MS + 600;
    wake();
  };
  function fall(p: Piece, now: number) {
    const k = clamp((now - p.t0) / DROP_MS, 0, 1);
    const e = bounce(k);
    p.y = DROP_H * (1 - e);
    const sh = p.y < SHADOW_Y;
    if (sh !== p.hit.castShadow) castShadow(p, sh);
    /* gira um pouco no eixo vertical enquanto cai, assentando no ângulo final */
    const yawNow = p.yaw0 + (p.yaw - p.yaw0) * Math.min(1, k * 1.6);
    /* geleia em cada toque no chão (primeiro impacto em k ≈ 0.36) */
    if (!p.landed && k >= 0.364) {
      p.landed = true;
      p.n.set(0, 1, 0);
      p.sv += 5.5;
    }
    if (k >= 1) {
      p.y = 0;
      p.state = "table";
      wakeP(p);
    }
    return yawNow;
  }

  /* ---------- ponteiro ---------- */
  let ptr: { nx: number; ny: number; x: number; y: number } | null = null;
  let ptrMoved = false;
  let lastInput = 0;
  /* down numa peça: vira arrasto só depois de CLICK_PX de movimento */
  let press: { piece: Piece; sx: number; sy: number; ox: number; oz: number } | null = null;
  let drag: { piece: Piece; tx: number; tz: number; ox: number; oz: number } | null = null;
  let hovered: Piece | null = null;
  const toNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect(); // só em eventos, nunca por frame
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return { nx: (x / r.width) * 2 - 1, ny: -(y / r.height) * 2 + 1, x, y };
  };
  /* raycast com a pose ATUAL de cada peça (matrizes do último frame) */
  const pick = (nx: number, ny: number) => {
    const live = pieces.filter((p) => p.group.visible && (onTable(p) || p.state === "falling"));
    for (const p of live) p.group.updateMatrixWorld(true);
    ndc.set(nx, ny);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(live.map((p) => p.hit), true)[0];
    return h ? (h.object.userData.piece as Piece) : null;
  };
  const tableAt = (nx: number, ny: number) => onPlane(nx, ny, T / 2);

  const onMove = (e: PointerEvent) => {
    ptr = toNdc(e);
    ptrMoved = true;
    lastInput = performance.now();
    if (press && !drag && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) >= CLICK_PX && press.piece.state === "table") {
      const p = press.piece;
      p.state = "drag";
      p.vx = p.vz = 0;
      wakeP(p);
      drag = { piece: p, tx: p.x, tz: p.z, ox: press.ox, oz: press.oz };
      canvas.style.cursor = "grabbing";
      on.hover(null, 0, 0);
    }
    if (drag) {
      const q = tableAt(ptr.nx, ptr.ny);
      if (q) {
        drag.tx = q.x + drag.ox;
        drag.tz = q.z + drag.oz;
      }
    }
    wake();
  };
  const onDown = (e: PointerEvent) => {
    if (focus) {
      on.close();
      return;
    }
    ptr = toNdc(e);
    const p = pick(ptr.nx, ptr.ny);
    if (!p) return;
    const q = tableAt(ptr.nx, ptr.ny);
    press = { piece: p, sx: e.clientX, sy: e.clientY, ox: q ? p.x - q.x : 0, oz: q ? p.z - q.z : 0 };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    wake();
  };
  const endDrag = (throwIt: boolean) => {
    if (!drag) return;
    const p = drag.piece;
    p.state = "table";
    p.y = 0;
    if (throwIt) {
      /* arremesso: a velocidade de arraste já suavizada, limitada */
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > MAX_SPEED) {
        p.vx *= MAX_SPEED / sp;
        p.vz *= MAX_SPEED / sp;
      }
    } else p.vx = p.vz = 0;
    p.n.set(0, 1, 0);
    p.sv += 3; // assenta na mesa com um "plop"
    wakeP(p);
    drag = null;
  };
  const onUp = (e: PointerEvent) => {
    if (!press) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    const pr = press;
    press = null;
    if (drag) endDrag(e.type === "pointerup");
    /* clique: soltou sem mover (< CLICK_PX) */ else if (e.type === "pointerup") on.select(pr.piece.token.id);
    canvas.style.cursor = hovered ? "pointer" : "";
    wake();
  };
  const onLeave = () => {
    ptr = null;
    hovered = null;
    on.hover(null, 0, 0);
    if (!drag) canvas.style.cursor = "";
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);

  /* ---------- loop ---------- */
  const D = new Matrix4();
  const M = new Matrix4();
  const pos = new Vector3();
  const quat = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const up = new Vector3(0, 1, 0);
  let raf = 0;
  let quiet = 0;
  let paused = true; // o StackStage liga quando esta seção é a que renderiza (lib/gl-slot)
  let last = performance.now();
  let acc = 0;

  /* pose → matriz, com a deformação da geleia no eixo n */
  const pose = (p: Piece, yaw: number) => {
    pos.set(p.x, p.y + p.oy, p.z);
    quat.setFromAxisAngle(up, yaw);
    M.compose(pos, quat, one);
    if (p.sx !== 0) {
      const a = 1 - p.sx, s = 1 + p.sx * 0.5, n = p.n, k = a - s;
      D.set(
        s + k * n.x * n.x, k * n.x * n.y, k * n.x * n.z, 0,
        k * n.y * n.x, s + k * n.y * n.y, k * n.y * n.z, 0,
        k * n.z * n.x, k * n.z * n.y, s + k * n.z * n.z, 0,
        0, 0, 0, 1,
      );
      M.multiply(D);
    }
    p.group.matrix.copy(M);
    p.group.matrixWorldNeedsUpdate = true;
  };

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;

    /* peça na mão: segue o alvo (cinemática); a velocidade medida vira o arremesso */
    if (drag) {
      const p = drag.piece;
      const tx = clamp(drag.tx, -bounds.x + R, bounds.x - R);
      const tz = clamp(drag.tz, bounds.z0 + R, bounds.z1 - R);
      const k = 1 - Math.exp(-28 * dt);
      let mx = (tx - p.x) * k, mz = (tz - p.z) * k;
      /* a peça na mão também respeita a velocidade máxima (não teleporta para dentro da pilha) */
      const ml = Math.hypot(mx, mz), lim = MAX_SPEED * dt;
      if (ml > lim) {
        mx *= lim / ml;
        mz *= lim / ml;
      }
      const nx = p.x + mx, nz = p.z + mz;
      if (dt > 0) {
        p.vx = p.vx * 0.6 + ((nx - p.x) / dt) * 0.4;
        p.vz = p.vz * 0.6 + ((nz - p.z) / dt) * 0.4;
      }
      p.x = nx;
      p.z = nz;
      p.y += (LIFT - p.y) * (1 - Math.exp(-14 * dt));
    }
    /* passo fixo de 1/60 s, no máximo 3 por frame */
    acc = Math.min(acc + dt, 3 * STEP);
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }

    let active = false;
    if (focus) active = focusFrame(now) || active;
    if (back) active = backFrame(now) || active;
    for (const p of pieces) {
      if (!p.group.visible || p.state === "focus" || p.state === "returning") continue;
      let yaw = p.yaw;
      if (p.state === "falling") {
        yaw = fall(p, now);
        active = true;
      }
      /* mola da geleia (~400 ms para assentar) */
      if (p.sx !== 0 || p.sv !== 0) {
        p.sv += (-260 * p.sx - 9 * p.sv) * dt;
        p.sx = clamp(p.sx + p.sv * dt, -0.3, 0.34);
        if (Math.abs(p.sx) < 0.002 && Math.abs(p.sv) < 0.02) p.sx = p.sv = 0;
        else active = true;
      }
      /* destaque por categoria: escurece e afunda devagar */
      if (p.dim !== p.dimT) {
        p.dim += (p.dimT - p.dim) * (1 - Math.exp(-9 * dt));
        if (Math.abs(p.dim - p.dimT) < 0.003) p.dim = p.dimT;
        p.body.color.copy(p.base).lerp(DIM_COLOR, DIM_MIX * p.dim);
        p.logo.color.copy(p.logoBase).lerp(DIM_COLOR, DIM_MIX * p.dim);
        /* sem isso o reflexo do verniz e do ambiente esconde a mudança de cor */
        p.body.clearcoat = 1 - 0.75 * p.dim;
        p.body.envMapIntensity = p.logo.envMapIntensity = 1 - 0.55 * p.dim;
        p.body.sheen = 0.35 * (1 - p.dim);
        active = true;
      }
      let oy = -DIM_SINK * p.dim;
      /* pulo: parábola com squash na saída e no pouso */
      if (p.hop) {
        const k = (now - p.hop) / HOP_MS;
        if (k >= 1) {
          p.hop = 0;
          squash(p, 0, 1, 0, 5.5);
        } else if (k > 0) oy += Math.sin(Math.PI * k) * HOP_H;
        active = true;
      }
      p.oy = oy;
      if (p.state === "drag" || (p.state === "table" && !p.asleep)) active = true;
      pose(p, yaw);
    }

    /* hover: raycast só quando o ponteiro mexeu; o cursor sem arrastar não empurra nada */
    if (ptr && ptrMoved && !drag && !focus) {
      ptrMoved = false;
      hovered = pick(ptr.nx, ptr.ny);
      canvas.style.cursor = hovered ? "pointer" : "";
    }
    if (ptr && hovered && !focus && !drag) on.hover(hovered.token.name, ptr.x, ptr.y);
    else on.hover(null, 0, 0);

    if (veilOut(now)) active = true;
    renderer.render(scene, camera);

    const busy = active || drag || press || now - lastInput < 400 || now < dropEnd;
    quiet = busy ? 0 : quiet + 1;
    if (quiet < 20) schedule();
  };

  /* ---------- foco (popup) ---------- */
  type Focus = { piece: Piece; t0: number; from: Vector3; fromQ: Quaternion; to: Vector3; toQ: Quaternion; toS: number };
  let focus: Focus | null = null;
  /* volta para a mesa depois do foco (tween até o lugar de onde saiu) */
  let back: { piece: Piece; t0: number; from: Matrix4 } | null = null;
  let veilFrom = 0;
  let veilT0 = 0;
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const fq = new Quaternion();
  const spin = new Quaternion();
  const fs = new Vector3();
  /* pose de destino: perto da câmera, à esquerda do painel (desktop) ou acima
   * dele (celular), virada de frente para quem olha */
  const focusPose = () => {
    const narrow = W < 640;
    const camY = camera.position.y;
    const p = onPlane(narrow ? 0 : -0.3, narrow ? 0.38 : 0.02, camY * 0.5) ?? new Vector3(0, camY * 0.5, 0);
    const toCam = camera.position.clone().sub(p).normalize();
    const q = new Quaternion().setFromUnitVectors(up, toCam);
    const vh = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.distanceTo(p);
    /* diâmetro ≈ 34% da altura do palco (≈ 26% no celular) */
    const s = (vh * (narrow ? 0.26 : 0.34)) / (2 * R);
    return { p, q, s };
  };
  function castShadow(p: Piece, on: boolean) {
    p.group.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = on;
    });
  }
  const focusOn = (id: string) => {
    const piece = pieces.find((p) => p.token.id === id);
    if (!piece) return;
    if (focus && focus.piece !== piece) focusOff();
    if (back?.piece === piece) {
      back = null;
    }
    if (drag?.piece === piece) endDrag(false);
    press = null;
    const t = focusPose();
    const from = new Vector3(), fromQ = new Quaternion();
    if (piece.group.visible) {
      piece.group.matrix.decompose(from, fromQ, fs);
    } else {
      /* ainda não caiu (ex.: aberto pelo teclado): entra de cima e fica no lugar sorteado */
      from.copy(t.p).add(new Vector3(0, 6, 0));
      fromQ.copy(t.q);
      piece.group.visible = true;
      piece.x = clamp(piece.x, -bounds.x + R, bounds.x - R);
      piece.z = clamp(piece.z, bounds.z0 + R, bounds.z1 - R);
    }
    piece.state = "focus";
    piece.vx = piece.vz = piece.w = 0;
    piece.sx = piece.sv = 0;
    piece.y = 0;
    veilFrom = veilMat.opacity;
    castShadow(piece, false); // voando até a câmera: a sombra gigante no chão confundiria
    focus = { piece, t0: performance.now(), from, fromQ, to: t.p, toQ: t.q, toS: t.s };
    veil.visible = true;
    hovered = null;
    canvas.style.cursor = "";
    wake();
  };
  const focusOff = () => {
    if (!focus) return;
    const p = focus.piece;
    p.state = "returning";
    back = { piece: p, t0: performance.now(), from: p.group.matrix.clone() };
    focus = null;
    veilFrom = veilMat.opacity;
    veilT0 = performance.now();
    wake();
  };
  function focusFrame(now: number) {
    const f = focus!;
    const k = ease(Math.min(1, (now - f.t0) / 500));
    const tt = now / 1000;
    /* flutua e gira devagar em torno do próprio eixo (de frente para a câmera) */
    pos.lerpVectors(f.from, f.to, k);
    pos.y += Math.sin(tt * 1.6) * 0.12 * k;
    spin.setFromAxisAngle(up, Math.sin(tt * 0.6) * 0.5 * k);
    fq.slerpQuaternions(f.fromQ, f.toQ, k).multiply(spin);
    const sc = 1 + (f.toS - 1) * k;
    fs.set(sc, sc, sc);
    f.piece.group.matrix.compose(pos, fq, fs);
    f.piece.group.matrixWorldNeedsUpdate = true;
    /* véu logo atrás da peça, de frente para a câmera */
    const dir = f.to.clone().sub(camera.position).normalize();
    veil.position.copy(f.to).addScaledVector(dir, R * f.toS * 1.6);
    veil.quaternion.copy(camera.quaternion);
    veilMat.opacity = veilFrom + (0.78 - veilFrom) * k;
    return true;
  }
  const bFrom = new Vector3(), bFromQ = new Quaternion(), bFromS = new Vector3();
  function backFrame(now: number) {
    const b = back!;
    const p = b.piece;
    const k = ease(Math.min(1, (now - b.t0) / 450));
    b.from.decompose(bFrom, bFromQ, bFromS);
    pos.set(p.x, 0, p.z);
    pos.lerpVectors(bFrom, pos.clone(), k);
    quat.setFromAxisAngle(up, p.yaw);
    fq.slerpQuaternions(bFromQ, quat, k);
    const sc = bFromS.x + (1 - bFromS.x) * k;
    fs.set(sc, sc, sc);
    p.group.matrix.compose(pos, fq, fs);
    p.group.matrixWorldNeedsUpdate = true;
    if (k >= 1) {
      p.state = "table";
      p.y = 0;
      p.n.set(0, 1, 0);
      p.sv += 4;
      wakeP(p);
      castShadow(p, true);
      back = null;
    }
    return true;
  }
  /* véu saindo depois do fechamento */
  const veilOut = (now: number) => {
    if (focus || !veil.visible) return false;
    const k = Math.min(1, (now - veilT0) / 350);
    veilMat.opacity = veilFrom * (1 - k);
    if (k >= 1) veil.visible = false;
    return k < 1;
  };

  function schedule() {
    /* pausado (fora da tela ou outra seção renderizando): nenhum frame; na
     * tela, o loop dorme sozinho quando tudo para (render sob demanda) */
    if (!raf && !paused && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function wake() {
    quiet = 0;
    if (!raf) last = performance.now();
    schedule();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(box);
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);
  resize();

  /* compila os shaders fora da main thread (KHR_parallel_shader_compile)
   * antes do primeiro frame; as fichas ainda invisíveis entram na compilação */
  for (const p of pieces) p.group.visible = true;
  veil.visible = true;
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* sem suporte: compila no primeiro render */
  }
  for (const p of pieces) p.group.visible = false;
  veil.visible = false;

  /* volta à seção: as peças reaparecem onde estavam, sem nova queda */
  const restore = (saved: { id: string; x: number; z: number; yaw: number }[]) => {
    dropped = true;
    for (const p of pieces) {
      const q = saved.find((s) => s.id === p.token.id);
      if (!q) continue;
      p.state = "table";
      p.x = clamp(q.x, -bounds.x, bounds.x);
      p.z = clamp(q.z, bounds.z0, bounds.z1);
      p.yaw = q.yaw;
      p.vx = p.vz = p.w = 0;
      p.y = 0;
      p.landed = true;
      castShadow(p, true);
      p.group.visible = true;
      wakeP(p);
    }
    wake();
  };

  /* índice: destaca as moedas de uma categoria (null limpa) */
  const highlight = (ids: string[] | null) => {
    for (const p of pieces) p.dimT = ids && !ids.includes(p.token.id) ? 1 : 0;
    wake();
  };
  /* índice: a moeda pula (squash); devolve false se ela não está na mesa */
  const bump = (id: string) => {
    const p = pieces.find((q) => q.token.id === id);
    if (!p || p.state !== "table") return false;
    p.hop = performance.now();
    squash(p, 0, 1, 0, 4);
    wake();
    return true;
  };

  return {
    drop,
    restore,
    highlight,
    bump,
    /* posições das peças na mesa (para restore); as que ainda caem já têm
     * x/z/yaw finais */
    state: () => pieces.filter((p) => p.state !== "hidden").map((p) => ({ id: p.token.id, x: p.x, z: p.z, yaw: p.yaw })),
    /* último frame, sem o véu do popup (para o snapshot estático ao desmontar) */
    snapshot() {
      if (!dropped) return null;
      const v = veil.visible;
      veil.visible = false;
      renderer.render(scene, camera);
      veil.visible = v;
      try {
        return canvas.toDataURL("image/webp", 0.82);
      } catch {
        return null;
      }
    },
    focus: focusOn,
    unfocus: focusOff,
    /* liga/desliga o loop (só uma seção 3D renderiza por vez) */
    pause(on: boolean) {
      if (on === paused) return;
      paused = on;
      if (on) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else wake();
    },
    /* testes: estado da mesa (posições, velocidades, rotação) */
    debug: () =>
      pieces.map((p) => ({ id: p.token.id, state: p.state, x: p.x, z: p.z, v: Math.hypot(p.vx, p.vz), w: p.w, yaw: p.yaw, asleep: p.asleep, dim: +p.dim.toFixed(3), dimT: p.dimT, bounds: { ...bounds } })),
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
