/*
 * STACK: logos da stack como fichas 3D "de geleia".
 *
 * three.js puro (sem React Three Fiber) + cannon-es. Este módulo inteiro só é
 * baixado quando a seção se aproxima (import dinâmico em StackStage).
 *
 *   ficha  = moeda low-poly (lathe, borda arredondada) + logo extrudado (SVG
 *            do simple-icons com bevel pequeno) por cima
 *   física = cilindros de 12 lados num chão com 4 paredes do tamanho da tela;
 *            o cursor é uma esfera cinemática invisível que empurra; arrastar
 *            usa uma restrição ponto-a-ponto (soltar = arremessar)
 *   geleia = mola amortecida por ficha: no impacto, achata no eixo da batida
 *            e estica no plano perpendicular (~400 ms para assentar)
 *   luz    = RoomEnvironment (PMREM, gerado uma vez) + 1 direcional; sombra
 *            de contato barata (um quad com gradiente radial por ficha)
 *   foco   = clicar numa peça: ela sai da física, voa (~500 ms) até a frente
 *            da câmera, cresce e flutua; um véu cor de papel apaga as outras.
 *            Ao fechar, volta para o mundo e cai de novo com a física.
 * Renderiza sob demanda: com tudo parado (corpos dormindo, molas assentadas,
 * sem ponteiro), o loop para até o próximo evento.
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import {
  Body,
  Cylinder,
  Plane as CPlane,
  PointToPointConstraint,
  SAPBroadphase,
  Sphere,
  Vec3,
  World,
  type ContactEquation,
} from "cannon-es";

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

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(20,16,10,0.55)");
  grd.addColorStop(0.6, "rgba(20,16,10,0.18)");
  grd.addColorStop(1, "rgba(20,16,10,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

type Piece = {
  token: Token;
  body: Body;
  group: Group;
  hit: Mesh;
  shadow: Mesh;
  shadowMat: MeshBasicMaterial;
  /* mola da geleia */
  x: number;
  v: number;
  n: Vector3;
};

/* cede a main thread entre blocos de trabalho pesado (montagem em pedaços) */
const yieldMain = () =>
  new Promise<void>((r) => {
    const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
    if (s?.yield) void s.yield().then(r);
    else setTimeout(r, 0);
  });

export async function createStackScene(canvas: HTMLCanvasElement, tokens: Token[], on: SceneEvents) {
  const box = canvas.parentElement!;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: dpr < 1.3, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();
  await yieldMain();
  const sun = new DirectionalLight(0xfff1dc, 1.4);
  sun.position.set(-4, 10, 6);
  scene.add(sun);

  const camera = new PerspectiveCamera(30, 1, 1, 80);
  camera.position.set(0, 19, 11);
  camera.lookAt(0, 0, 0.4);

  /* ---------- física ---------- */
  const world = new World({ gravity: new Vec3(0, -32, 0), allowSleep: true });
  world.broadphase = new SAPBroadphase(world);
  world.defaultContactMaterial.friction = 0.32;
  world.defaultContactMaterial.restitution = 0.22;
  (world.solver as unknown as { iterations: number }).iterations = 8;

  const floor = new Body({ mass: 0, shape: new CPlane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floor);
  const walls = [0, 1, 2, 3].map(() => {
    const b = new Body({ mass: 0, shape: new CPlane() });
    world.addBody(b);
    return b;
  });
  const bounds = { x: 6, z0: -4, z1: 4 };

  const cursor = new Body({ mass: 0, type: Body.KINEMATIC, shape: new Sphere(1.05) });
  cursor.position.set(0, -40, 0);
  world.addBody(cursor);
  const joint = new Body({ mass: 0, type: Body.KINEMATIC });
  joint.collisionFilterGroup = 0;
  joint.collisionFilterMask = 0;
  world.addBody(joint);

  /* ---------- fichas ---------- */
  const coin = coinGeometry();
  const shadowGeo = new PlaneGeometry(2.7, 2.7);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowTex = shadowTexture();
  const disposables: { dispose(): void }[] = [coin, shadowGeo, shadowTex, envRT];

  const build = (token: Token): Piece => {
    const base = tone(token.hex);
    const bodyMat = new MeshPhysicalMaterial({
      color: base,
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      sheen: 0.35,
      sheenRoughness: 0.5,
      sheenColor: new Color("#ffc779"),
    });
    const logoMat = new MeshPhysicalMaterial({
      color: lum(base) < 0.16 ? PAPER : INK,
      roughness: 0.4,
      clearcoat: 0.7,
      clearcoatRoughness: 0.2,
    });
    const group = new Group();
    group.matrixAutoUpdate = false;
    group.visible = false;
    const hit = new Mesh(coin, bodyMat);
    group.add(hit);
    const lg = logoGeometry(token.path);
    if (lg) {
      /* logo nas duas faces: a ficha pode cair (ou ser jogada) de cabeça para baixo */
      const under = lg.clone().rotateX(Math.PI);
      group.add(new Mesh(lg, logoMat), new Mesh(under, logoMat));
      disposables.push(lg, under);
    }
    scene.add(group);

    const shadowMat = new MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 });
    const shadow = new Mesh(shadowGeo, shadowMat);
    shadow.position.y = 0.01;
    shadow.renderOrder = -1;
    scene.add(shadow);
    disposables.push(bodyMat, logoMat, shadowMat);

    const body = new Body({
      mass: 1,
      shape: new Cylinder(R, R, T, 12),
      linearDamping: 0.06,
      angularDamping: 0.12,
      sleepSpeedLimit: 0.18,
      sleepTimeLimit: 0.5,
    });
    const piece: Piece = { token, body, group, hit, shadow, shadowMat, x: 0, v: 0, n: new Vector3(0, 1, 0) };
    hit.userData.piece = piece;

    const q = new Quaternion();
    body.addEventListener("collide", (e: { contact: ContactEquation }) => {
      const iv = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (iv < 1.4) return;
      const ni = e.contact.ni;
      q.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w).invert();
      piece.n.set(ni.x, ni.y, ni.z).applyQuaternion(q).normalize();
      piece.v += Math.min(iv * 0.55, 7);
      wake();
    });
    return piece;
  };
  /* extrusão dos logos: 3 por vez, devolvendo a thread entre os blocos */
  const pieces: Piece[] = [];
  for (let i = 0; i < tokens.length; i++) {
    pieces.push(build(tokens[i]));
    if (i % 3 === 2) await yieldMain();
  }

  /* véu: plano de papel entre a pilha e a peça em foco (sem 2º contexto) */
  const veilMat = new MeshBasicMaterial({ color: new Color("#e9e7e2"), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const veil = new Mesh(new PlaneGeometry(400, 400), veilMat);
  veil.visible = false;
  veil.renderOrder = 5;
  scene.add(veil);
  disposables.push(veilMat, veil.geometry);
  const inWorld = new Set<Body>();

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
    /* telas estreitas: afasta a câmera para caber a largura mínima do chão */
    const dist = W / H < 0.9 ? 1.55 : W / H < 1.3 ? 1.2 : 1;
    camera.position.set(0, 19 * dist, 11 * dist);
    camera.lookAt(0, 0, 0.4);
    camera.updateProjectionMatrix();
    const bl = onPlane(-1, -1, 0), tl = onPlane(-1, 1, 0);
    if (bl && tl) {
      bounds.x = Math.abs(bl.x) - 0.15;
      bounds.z1 = bl.z - 0.25;
      bounds.z0 = tl.z + 0.6;
    }
    const set = (b: Body, x: number, z: number, ry: number) => {
      b.position.set(x, 0, z);
      b.quaternion.setFromEuler(0, ry, 0);
    };
    set(walls[0], -bounds.x, 0, Math.PI / 2);
    set(walls[1], bounds.x, 0, -Math.PI / 2);
    set(walls[2], 0, bounds.z0, 0);
    set(walls[3], 0, bounds.z1, Math.PI);
    for (const p of pieces) {
      const b = p.body;
      b.position.x = Math.max(-bounds.x + R, Math.min(bounds.x - R, b.position.x));
      b.position.z = Math.max(bounds.z0 + R, Math.min(bounds.z1 - R, b.position.z));
      b.wakeUp();
    }
    wake();
  };

  /* ---------- queda ---------- */
  let dropped = false;
  const timers: number[] = [];
  const drop = () => {
    if (dropped) return;
    dropped = true;
    pieces.forEach((p, i) => {
      timers.push(
        window.setTimeout(() => {
          const b = p.body;
          if (inWorld.has(b) || focus?.piece === p) return;
          b.position.set((Math.random() * 2 - 1) * (bounds.x - R) * 0.9, 7 + Math.random() * 2, bounds.z0 + R + Math.random() * (bounds.z1 - bounds.z0 - 2 * R));
          /* logos quase de pé para quem olha: giro pequeno no eixo vertical */
          b.quaternion.setFromEuler((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.9);
          b.angularVelocity.set((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
          world.addBody(b);
          inWorld.add(b);
          p.group.visible = true;
          wake();
        }, i * 85),
      );
    });
  };

  /* ---------- ponteiro ---------- */
  let ptr: { nx: number; ny: number; x: number; y: number } | null = null;
  let ptrMoved = false;
  let lastInput = 0;
  let drag: { piece: Piece; c: PointToPointConstraint; t0: number; sx: number; sy: number; moved: number } | null = null;
  let hovered: Piece | null = null;
  const toNdc = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect(); // só em eventos, nunca por frame
    const x = e.clientX - r.left, y = e.clientY - r.top;
    return { nx: (x / r.width) * 2 - 1, ny: -(y / r.height) * 2 + 1, x, y };
  };
  const pick = (nx: number, ny: number) => {
    ndc.set(nx, ny);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pieces.filter((p) => p.group.visible).map((p) => p.hit), false)[0];
    return h ? { piece: h.object.userData.piece as Piece, point: h.point } : null;
  };

  const onMove = (e: PointerEvent) => {
    ptr = toNdc(e);
    ptrMoved = true;
    lastInput = performance.now();
    if (drag) {
      drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      const p = onPlane(ptr.nx, ptr.ny, 2.2);
      if (p) joint.position.set(p.x, p.y, p.z);
    }
    wake();
  };
  const onDown = (e: PointerEvent) => {
    if (focus) {
      on.close();
      return;
    }
    ptr = toNdc(e);
    const h = pick(ptr.nx, ptr.ny);
    if (!h) return;
    const b = h.piece.body;
    const local = b.pointToLocalFrame(new Vec3(h.point.x, h.point.y, h.point.z));
    const p = onPlane(ptr.nx, ptr.ny, 2.2) ?? h.point;
    joint.position.set(p.x, p.y, p.z);
    const c = new PointToPointConstraint(b, local, joint, new Vec3(0, 0, 0), 90);
    world.addConstraint(c);
    b.wakeUp();
    drag = { piece: h.piece, c, t0: performance.now(), sx: e.clientX, sy: e.clientY, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    wake();
  };
  const onUp = (e: PointerEvent) => {
    if (!drag) return;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    world.removeConstraint(drag.c);
    const b = drag.piece.body;
    const quick = performance.now() - drag.t0 < 280 && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8;
    if (quick) on.select(drag.piece.token.id);
    else b.velocity.scale(1.25, b.velocity); // arremesso
    drag = null;
    canvas.style.cursor = "";
    wake();
  };
  const onLeave = () => {
    ptr = null;
    hovered = null;
    on.hover(null, 0, 0);
    canvas.style.cursor = "";
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
  let raf = 0;
  let quiet = 0;
  let last = performance.now();
  let acc = 0;

  const frame = (now: number) => {
    raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;

    /* cursor empurra (sem arrasto em curso) */
    const target = ptr && !drag && !focus ? onPlane(ptr.nx, ptr.ny, 0.55) : null;
    if (target) {
      if (cursor.position.y < -10) cursor.position.set(target.x, target.y, target.z);
      cursor.velocity.set((target.x - cursor.position.x) * 30, 0, (target.z - cursor.position.z) * 30);
    } else {
      cursor.position.set(0, -40, 0);
      cursor.velocity.set(0, 0, 0);
    }
    /* passo fixo de 1/60 s, no máximo 3 por frame */
    acc = Math.min(acc + dt, 3 / 60);
    while (acc >= 1 / 60) {
      world.step(1 / 60);
      acc -= 1 / 60;
    }

    let active = false;
    if (focus) active = focusFrame(now) || active;
    for (const p of pieces) {
      if (!p.group.visible || focus?.piece === p) continue;
      const b = p.body;
      /* mola da geleia: x = achatamento no eixo n */
      if (p.x !== 0 || p.v !== 0) {
        p.v += (-260 * p.x - 9 * p.v) * dt;
        p.x = Math.max(-0.3, Math.min(0.34, p.x + p.v * dt));
        if (Math.abs(p.x) < 0.002 && Math.abs(p.v) < 0.02) p.x = p.v = 0;
        else active = true;
      }
      pos.set(b.position.x, b.position.y, b.position.z);
      quat.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      M.compose(pos, quat, one);
      if (p.x !== 0) {
        const a = 1 - p.x, s = 1 + p.x * 0.5, n = p.n, k = a - s;
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
      /* sombra de contato: some com a altura */
      p.shadow.position.set(b.position.x, 0.01, b.position.z);
      const hgt = Math.max(0, b.position.y - T / 2);
      p.shadowMat.opacity = Math.max(0, 0.9 - hgt * 0.22);
      p.shadow.scale.setScalar(1 + hgt * 0.12);
      if (b.sleepState !== Body.SLEEPING) active = true;
    }

    /* hover: raycast só quando o ponteiro mexeu */
    if (ptr && ptrMoved && !drag && !focus) {
      ptrMoved = false;
      const h = pick(ptr.nx, ptr.ny);
      hovered = h?.piece ?? null;
      canvas.style.cursor = hovered ? "grab" : "";
    }
    if (ptr && hovered && !focus) on.hover(hovered.token.name, ptr.x, ptr.y);
    else if (!drag) on.hover(null, 0, 0);

    if (veilOut(now)) active = true;
    renderer.render(scene, camera);

    const busy = active || drag || now - lastInput < 600 || timers.length > 0 && now - startAt < tokens.length * 85 + 2500;
    quiet = busy ? 0 : quiet + 1;
    if (quiet < 30) schedule();
  };

  /* ---------- foco ---------- */
  type Focus = { piece: Piece; t0: number; from: Vector3; fromQ: Quaternion; fromS: number; to: Vector3; toQ: Quaternion; toS: number; out: boolean };
  let focus: Focus | null = null;
  let veilFrom = 0;
  const up = new Vector3(0, 1, 0);
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  const fq = new Quaternion();
  const wob = new Quaternion();
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
  const focusOn = (id: string) => {
    const piece = pieces.find((p) => p.token.id === id);
    if (!piece) return;
    if (focus && focus.piece !== piece) release(focus);
    const b = piece.body;
    const from = new Vector3(), fromQ = new Quaternion();
    const t = focusPose();
    if (piece.group.visible) {
      from.set(b.position.x, b.position.y, b.position.z);
      fromQ.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    } else {
      /* ainda não caiu (ex.: aberto pelo teclado): entra de cima */
      from.copy(t.p).add(new Vector3(0, 6, 0));
      fromQ.copy(t.q);
      piece.group.visible = true;
    }
    if (inWorld.has(b)) {
      world.removeBody(b);
      inWorld.delete(b);
    }
    piece.x = piece.v = 0;
    veilFrom = veilMat.opacity;
    focus = { piece, t0: performance.now(), from, fromQ, fromS: 1, to: t.p, toQ: t.q, toS: t.s, out: false };
    veil.visible = true;
    hovered = null;
    canvas.style.cursor = "";
    wake();
  };
  /* devolve a peça à física a partir da pose atual */
  const release = (f: Focus) => {
    const b = f.piece.body;
    const m = f.piece.group.matrix;
    m.decompose(pos, quat, fs);
    b.position.set(
      Math.max(-bounds.x + R, Math.min(bounds.x - R, pos.x)),
      Math.min(pos.y, 7),
      Math.max(bounds.z0 + R, Math.min(bounds.z1 - R, pos.z)),
    );
    b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    b.velocity.set(0, -2, 0);
    b.angularVelocity.set((Math.random() - 0.5) * 4, 0, (Math.random() - 0.5) * 4);
    world.addBody(b);
    inWorld.add(b);
    b.wakeUp();
    f.piece.shadowMat.opacity = 0;
  };
  const focusOff = () => {
    if (!focus) return;
    release(focus);
    focus = null;
    veilFrom = veilMat.opacity;
    veilT0 = performance.now();
    wake();
  };
  let veilT0 = 0;
  function focusFrame(now: number) {
    const f = focus!;
    const k = ease(Math.min(1, (now - f.t0) / 500));
    const tt = now / 1000;
    /* flutua e oscila devagar (sem girar o logo no próprio plano) */
    pos.lerpVectors(f.from, f.to, k);
    pos.y += Math.sin(tt * 1.6) * 0.12 * k;
    wob.setFromAxisAngle(up, Math.sin(tt * 0.7) * 0.45 * k);
    fq.slerpQuaternions(f.fromQ, f.toQ, k).premultiply(wob);
    const sc = f.fromS + (f.toS - f.fromS) * k;
    fs.set(sc, sc, sc);
    f.piece.group.matrix.compose(pos, fq, fs);
    f.piece.group.matrixWorldNeedsUpdate = true;
    f.piece.shadowMat.opacity = Math.max(0, f.piece.shadowMat.opacity - 0.08);
    /* véu logo atrás da peça, de frente para a câmera */
    const dir = f.to.clone().sub(camera.position).normalize();
    veil.position.copy(f.to).addScaledVector(dir, R * f.toS * 1.6);
    veil.quaternion.copy(camera.quaternion);
    veilMat.opacity = veilFrom + (0.78 - veilFrom) * k;
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

  let startAt = 0;
  function schedule() {
    /* sem IntersectionObserver próprio: o StackStage desmonta a cena longe da
     * tela, e perto dela o loop dorme sozinho quando tudo para (render sob demanda) */
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
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
    /* sem suporte: compila no primeiro render, como antes */
  }
  for (const p of pieces) p.group.visible = false;
  veil.visible = false;

  return {
    drop() {
      startAt = performance.now();
      drop();
    },
    focus: focusOn,
    unfocus: focusOff,
    destroy() {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
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
