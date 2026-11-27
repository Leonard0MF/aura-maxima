/*
 * Layout determinístico do AUDIT (semente fixa): o MESMO desenho no WebGL e
 * na imagem estática do fallback.
 *
 * A constelação é a nuvem 3D ORIGINAL (feat/audit-constellation, #5): nós
 * principais numa elipse com profundidade, linhas entre vizinhos mais
 * próximos e partículas em volume (aglomerados nos nós, filamentos nas
 * linhas e uma poeira de fundo). Tudo em coordenadas da própria nuvem,
 * centradas no CENTRÓIDE (o pivô da rotação), dentro de uma esfera de raio
 * `radius`: nada sai dela, então qualquer rotação cabe no mesmo lugar.
 *
 * O buraco negro fica fora da nuvem (holeCenter); a nuvem é encaixada na
 * maior área livre (fitSphere): longe das bordas, dos textos e do disco.
 */
export const CAMERA_Z = 7.2;
export const FOV = 38;
/** meia altura visível no plano z = 0 (unidades de cena) */
export const HALF_H = CAMERA_Z * Math.tan(((FOV / 2) * Math.PI) / 180);
/** forma da nuvem original (unidades de cena) */
export const SPREAD = { x: 3.4, y: 1.5, z: 1.4 };
/** área segura: nada a menos disto das bordas do campo (px) */
export const SAFE = 48;
/** folga em volta das caixas de texto (px) */
export const KEEP_PAD = 16;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Layout = {
  /** quantos nós principais (o layout serve para esse número) */
  n: number;
  /** nós principais: xyz (3 por nó), relativos ao centróide */
  nodes: Float32Array;
  /** pares de nós ligados por linha (cada nó com os 2 vizinhos mais próximos) */
  links: [number, number][];
  /** partículas: xyz relativos ao centróide, semente (0..1), tom (0 = off-white, 1 = âmbar), tamanho */
  points: Float32Array;
  seeds: Float32Array;
  tones: Float32Array;
  sizes: Float32Array;
  count: number;
  /** raio da esfera envolvente (centro no centróide): nós e partículas cabem nela */
  radius: number;
};

/* mesmo resultado nos dois caminhos: Worker (de uma vez) ou main thread em
 * pedaços (sem Worker): o gerador para a cada `chunk` partículas */
export function makeLayout(nNodes: number, count: number, seed = 7): Layout {
  const it = layoutSteps(nNodes, count, seed, Infinity);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/** sem Worker: gera em pedaços de `chunk` partículas, um por idle */
export async function makeLayoutChunked(nNodes: number, count: number, idle: () => Promise<void>, chunk = 300): Promise<Layout> {
  const it = layoutSteps(nNodes, count, 7, chunk);
  let r = it.next();
  while (!r.done) {
    await idle();
    r = it.next();
  }
  return r.value;
}

function* layoutSteps(nNodes: number, count: number, seed: number, chunk: number): Generator<void, Layout, void> {
  /* ---- a geração original (mesma semente, mesma ordem de sorteio) ---- */
  const r = rng(seed);
  const g = () => {
    const u = Math.max(1e-6, r());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };

  /* nós: ângulos quase uniformes numa elipse, com jitter de raio e profundidade */
  const nodes = new Float32Array(nNodes * 3);
  for (let i = 0; i < nNodes; i++) {
    const a = (i / nNodes) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const k = 0.45 + r() * 0.5;
    nodes[i * 3] = Math.cos(a) * SPREAD.x * k;
    nodes[i * 3 + 1] = Math.sin(a) * SPREAD.y * k;
    nodes[i * 3 + 2] = (r() - 0.5) * SPREAD.z;
  }

  /* linhas: cada nó com os 2 vizinhos mais próximos (sem repetir pares) */
  const links: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < nNodes; i++) {
    const d = [...Array(nNodes).keys()]
      .filter((j) => j !== i)
      .map((j) => [j, Math.hypot(nodes[j * 3] - nodes[i * 3], nodes[j * 3 + 1] - nodes[i * 3 + 1], nodes[j * 3 + 2] - nodes[i * 3 + 2])] as const)
      .sort((a, b) => a[1] - b[1]);
    for (const [j] of d.slice(0, 2)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push([i, j]);
      }
    }
  }

  const points = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const tones = new Float32Array(count);
  const sizes = new Float32Array(count);
  const at = (i: number) => [nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2]];
  for (let p = 0; p < count; p++) {
    if (p > 0 && p % chunk === 0) yield;
    const kind = r();
    let x: number, y: number, z: number;
    if (kind < 0.42 || !links.length) {
      /* aglomerado em volta de um nó */
      const [nx, ny, nz] = at(Math.floor(r() * nNodes));
      const s = 0.18 + r() * 0.32;
      x = nx + g() * s;
      y = ny + g() * s;
      z = nz + g() * s;
    } else if (kind < 0.8) {
      /* filamento entre dois nós ligados (afina no meio) */
      const [i, j] = links[Math.floor(r() * links.length)];
      const [ax, ay, az] = at(i);
      const [bx, by, bz] = at(j);
      const t = r();
      const s = 0.05 + 0.1 * Math.sin(Math.PI * t);
      x = ax + (bx - ax) * t + g() * s;
      y = ay + (by - ay) * t + g() * s;
      z = az + (bz - az) * t + g() * s;
    } else {
      /* poeira de fundo */
      x = (r() * 2 - 1) * SPREAD.x * 1.25;
      y = (r() * 2 - 1) * SPREAD.y * 1.45;
      z = (r() * 2 - 1) * SPREAD.z;
    }
    points[p * 3] = x;
    points[p * 3 + 1] = y;
    points[p * 3 + 2] = z;
    seeds[p] = r();
    tones[p] = r() < 0.32 ? 1 : 0;
    sizes[p] = 0.6 + Math.pow(r(), 3) * 1.6;
  }

  /* ---- centróide (pivô) e esfera envolvente ---- */
  const c = [0, 0, 0];
  for (let i = 0; i < nNodes; i++) for (let k = 0; k < 3; k++) c[k] += nodes[i * 3 + k] / nNodes;
  for (let i = 0; i < nNodes; i++) for (let k = 0; k < 3; k++) nodes[i * 3 + k] -= c[k];
  for (let p = 0; p < count; p++) for (let k = 0; k < 3; k++) points[p * 3 + k] -= c[k];
  /* raio: o nó mais distante + a folga de um aglomerado (a deriva do shader
   * soma ~0,035). A poeira de fundo e as caudas dos aglomerados que passarem
   * disso voltam para dentro (na mesma direção, entre 85% e 100% do raio):
   * nenhuma partícula escapa da esfera, em nenhuma rotação */
  let rn = 0;
  for (let i = 0; i < nNodes; i++) rn = Math.max(rn, Math.hypot(nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2]));
  const radius = rn + 0.55;
  const inner = radius - 0.06;
  for (let p = 0; p < count; p++) {
    const l = Math.hypot(points[p * 3], points[p * 3 + 1], points[p * 3 + 2]);
    if (l <= inner) continue;
    const f = (inner * (0.85 + 0.15 * seeds[p])) / l;
    for (let k = 0; k < 3; k++) points[p * 3 + k] *= f;
  }

  return { n: nNodes, nodes, links, points, seeds, tones, sizes, count, radius };
}

/* ---------- onde a nuvem cabe (px do campo) ---------- */

export type Rect = { x: number; y: number; w: number; h: number };

/** raio externo do disco de acreção, em rs (o mesmo ROUT do shader) */
export const DISK_RS = 9;
export const DISK_VISIBLE_RS = 6.5;
/** área proibida em volta do buraco negro (disco visível + arco da lente), em rs */
export const EXCL_X = 7.4;
export const EXCL_Y = 8.6;

/*
 * Onde fica o buraco negro num campo de w × h px. Fonte única para a cena, a
 * imagem estática e o círculo da transição (AuditReveal).
 *  - largo: terço esquerdo, na altura do meio
 *  - estreito (aspecto < 0,9 ou < 640 px): no topo, centralizado (a nuvem
 *    fica embaixo)
 */
export function holeCenter(w: number, h: number) {
  /* < 640 px de largura é sempre o layout do celular, mesmo com o campo
   * quase quadrado (ex.: 360 × 370) */
  const narrow = w / h < 0.9 || w < 640;
  if (!narrow) return { narrow, x: w * 0.25, y: h * 0.5, rs: Math.min(h * 0.026, w * 0.018) };
  /* celular: disco VISÍVEL com ~45% da largura, no topo; o arco de cima da
   * lente sobe ~7,7 rs: cabe com folga */
  const rs = Math.min((w * 0.45) / (2 * DISK_VISIBLE_RS), (h * 0.42) / (2 * EXCL_Y));
  return { narrow, x: w / 2, y: Math.max(h * 0.19, 7.7 * rs + 18), rs };
}

export type Fit = {
  hc: ReturnType<typeof holeCenter>;
  /** semi-eixos da área proibida do buraco negro (px) */
  ex: number;
  ey: number;
  /** o círculo onde a esfera da nuvem aparece (px do campo) */
  cx: number;
  cy: number;
  r: number;
};

/*
 * O maior círculo da área segura: ≥ SAFE px das bordas, fora das caixas de
 * texto (com folga) e da área proibida do buraco negro. A esfera da nuvem
 * é escalada para aparecer dentro dele: como a nuvem nunca sai da esfera,
 * nenhuma rotação a tira da área segura. Busca em grade (8 px), sem acaso.
 */
export function fitSphere(w: number, h: number, keep: Rect[]): Fit {
  const hc = holeCenter(w, h);
  const ex = EXCL_X * hc.rs, ey = EXCL_Y * hc.rs;
  /* distância de (x, y) até o obstáculo mais perto (negativa = dentro) */
  const room = (x: number, y: number) => {
    let d = Math.min(x - SAFE, y - SAFE, w - SAFE - x, h - SAFE - y);
    for (const k of keep) {
      const x0 = k.x - KEEP_PAD, y0 = k.y - KEEP_PAD, x1 = k.x + k.w + KEEP_PAD, y1 = k.y + k.h + KEEP_PAD;
      const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
      d = Math.min(d, dx || dy ? Math.hypot(dx, dy) : -Math.min(x - x0, x1 - x, y - y0, y1 - y));
    }
    /* elipse do buraco negro: distância aproximada (escala pelo menor semi-eixo) */
    const q = Math.hypot((x - hc.x) / ex, (y - hc.y) / ey);
    d = Math.min(d, (q - 1) * Math.min(ex, ey));
    return d;
  };
  let best = { cx: w * 0.62, cy: h * 0.5, r: 0 };
  /* empate (±4 px): o mais perto do meio horizontal da faixa livre (no
   * celular, centralizada embaixo do buraco negro) */
  const mid = hc.narrow ? w / 2 : (hc.x + ex + w) / 2;
  /* grade grossa (24 px) e depois fina (4 px) em volta dos melhores: < 1 ms */
  const cells: { x: number; y: number; r: number }[] = [];
  let top = 0;
  const scan = (x0: number, x1: number, y0: number, y1: number, step: number) => {
    for (let y = Math.max(SAFE, y0); y <= Math.min(h - SAFE, y1); y += step)
      for (let x = Math.max(SAFE, x0); x <= Math.min(w - SAFE, x1); x += step) {
        const r = room(x, y);
        cells.push({ x, y, r });
        top = Math.max(top, r);
      }
  };
  scan(SAFE, w - SAFE, SAFE, h - SAFE, 24);
  for (const c of cells.filter((c) => c.r >= top - 24).sort((a, b) => b.r - a.r).slice(0, 40)) scan(c.x - 20, c.x + 20, c.y - 20, c.y + 20, 4);
  for (const c of cells)
    if (c.r > 0 && c.r >= top - 4 && (best.r === 0 || Math.abs(c.x - mid) < Math.abs(best.cx - mid))) best = { cx: c.x, cy: c.y, r: c.r };
  /* nunca maior que ~42% da altura (a nuvem não precisa tomar a seção) */
  best.r = Math.min(best.r, h * 0.42);
  return { hc, ex, ey, ...best };
}

/* projeção da câmera fixa (sem rotação) para a imagem estática */
export function projectStatic(x: number, y: number, z: number, w: number, h: number) {
  const f = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
  const d = CAMERA_Z - z;
  return { x: w / 2 + ((x * f) / d) * (h / 2), y: h / 2 - ((y * f) / d) * (h / 2), s: CAMERA_Z / d };
}

/*
 * Posição e escala da nuvem (mundo) para que a esfera de raio `radius`
 * apareça dentro do círculo `fit` (com folga para o halo dos nós e para a
 * silhueta de uma esfera fora do eixo, que é um pouco maior que o círculo).
 */
export function placeCloud(fit: Fit, w: number, h: number, radius: number) {
  const asp = w / h;
  const fpx = h / 2 / Math.tan(((FOV / 2) * Math.PI) / 180); // px por unidade a distância 1
  const rpx = Math.max(8, (fit.r - 16) * 0.92);
  const k = rpx / fpx; // tan do meio-ângulo da silhueta
  const Rw = (CAMERA_Z * k) / Math.sqrt(1 + k * k);
  return {
    x: ((fit.cx / w) * 2 - 1) * asp * HALF_H,
    y: (1 - (fit.cy / h) * 2) * HALF_H,
    scale: Rw / radius,
    /** raio da esfera na tela (px): 1 px de arraste = 1 / rpx rad */
    rpx,
  };
}
