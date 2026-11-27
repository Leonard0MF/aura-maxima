/*
 * Layout determinístico do AUDIT (semente fixa): o MESMO desenho no WebGL e
 * na imagem estática do fallback. Duas camadas:
 *
 * 1. Campo de estrelas: partículas na seção INTEIRA. Cada estrela guarda a
 *    posição na tela (NDC, com sobra para o parallax) e a distância até a
 *    câmera; o shader monta a posição 3D com o aspecto atual. Então elas
 *    cobrem 100% da largura e da altura em qualquer tamanho, numa faixa
 *    funda de z (de perto da câmera até bem longe). Não giram com o arraste.
 *
 * 2. Rede de nós: os nós principais e partículas finas num VOLUME quase
 *    esférico (x : y : z ≈ 1 : 0,8 : 1; a extensão em z é igual à de x).
 *    Os nós ocupam o volume todo (frente e fundo), ligados aos vizinhos mais
 *    próximos em 3D, formando 2 ou 3 grupos. Tudo centrado no CENTRÓIDE dos
 *    nós (o pivô da rotação), dentro de uma esfera de raio `radius`: nada
 *    sai dela, então qualquer rotação cabe no mesmo lugar.
 */
export const CAMERA_Z = 7.2;
export const FOV = 42;
/** meia altura visível no plano z = 0 (unidades de cena) */
export const HALF_H = CAMERA_Z * Math.tan(((FOV / 2) * Math.PI) / 180);
/** semi-eixos do volume dos nós (unidades de cena): x : y : z = 1 : 0,8 : 1 */
export const VOL = { x: 2.2, y: 1.76, z: 2.2 };
/** estrelas: distância até a câmera (unidades de cena) e sobra de tela para o parallax */
export const STAR_NEAR = 2.4;
export const STAR_FAR = 34;
export const STAR_OVER = 1.08;
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
  /** pares de nós ligados por linha */
  links: [number, number][];
  /** quantos grupos (componentes) as linhas formam */
  groups: number;
  /** partículas da rede: xyz relativos ao centróide, semente (0..1), tom (0 = off-white, 1 = âmbar), tamanho */
  points: Float32Array;
  seeds: Float32Array;
  tones: Float32Array;
  sizes: Float32Array;
  count: number;
  /** raio da esfera envolvente (centro no centróide): nós e partículas cabem nela */
  radius: number;
  /** estrelas: x, y (NDC, com sobra), distância até a câmera, semente (4 por estrela) */
  stars: Float32Array;
  starCount: number;
};

/* mesmo resultado nos dois caminhos: Worker (de uma vez) ou main thread em
 * pedaços (sem Worker): o gerador para a cada `chunk` partículas */
export function makeLayout(nNodes: number, count: number, starCount: number, seed = 7): Layout {
  const it = layoutSteps(nNodes, count, starCount, seed, Infinity);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/** sem Worker: gera em pedaços de `chunk` partículas, um por idle */
export async function makeLayoutChunked(nNodes: number, count: number, starCount: number, idle: () => Promise<void>, chunk = 300): Promise<Layout> {
  const it = layoutSteps(nNodes, count, starCount, 7, chunk);
  let r = it.next();
  while (!r.done) {
    await idle();
    r = it.next();
  }
  return r.value;
}

/* grupos das linhas (union-find) */
function components(n: number, links: [number, number][]) {
  const up = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (up[i] === i ? i : (up[i] = find(up[i])));
  for (const [a, b] of links) up[find(a)] = find(b);
  return { find, count: new Set(Array.from({ length: n }, (_, i) => find(i))).size };
}

function* layoutSteps(nNodes: number, count: number, starCount: number, seed: number, chunk: number): Generator<void, Layout, void> {
  const r = rng(seed);
  const g = () => {
    const u = Math.max(1e-6, r());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
  /* ponto uniforme dentro da bola unitária */
  const ball = () => {
    for (;;) {
      const x = r() * 2 - 1, y = r() * 2 - 1, z = r() * 2 - 1;
      if (x * x + y * y + z * z <= 1) return [x, y, z];
    }
  };

  /* ---- nós: espalhados pelo volume (distância mínima entre eles, medida
   * no elipsóide normalizado), frente e fundo inclusive ---- */
  const nodes = new Float32Array(nNodes * 3);
  const unit: number[][] = [];
  let minD = 0.72;
  for (let i = 0, tries = 0; i < nNodes; tries++) {
    if (tries > 400) {
      minD *= 0.92; // não coube: afrouxa um pouco
      tries = 0;
    }
    const [x, y, z] = ball().map((v) => v * 0.94);
    if (unit.some((u) => Math.hypot(u[0] - x, u[1] - y, u[2] - z) < minD)) continue;
    unit.push([x, y, z]);
    nodes.set([x * VOL.x, y * VOL.y, z * VOL.z], i * 3);
    i++;
  }
  const at = (i: number) => [nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2]];
  const dist = (i: number, j: number) => Math.hypot(nodes[i * 3] - nodes[j * 3], nodes[i * 3 + 1] - nodes[j * 3 + 1], nodes[i * 3 + 2] - nodes[j * 3 + 2]);

  /* ---- linhas: cada nó com o vizinho mais próximo em 3D (1–2 por nó);
   * depois junta ou separa grupos até ficarem 2 ou 3 ---- */
  const links: [number, number][] = [];
  const has = (a: number, b: number) => links.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  const deg = (i: number) => links.filter(([p, q]) => p === i || q === i).length;
  for (let i = 0; i < nNodes; i++) {
    if (deg(i) > 0) continue; // já ligado por um vizinho
    let best = -1;
    for (let j = 0; j < nNodes; j++) if (j !== i && deg(j) < 2 && !has(i, j) && (best < 0 || dist(i, j) < dist(i, best))) best = j;
    if (best >= 0) links.push([i, best]);
  }
  for (let c = components(nNodes, links); c.count > 3; c = components(nNodes, links)) {
    let pick: [number, number] | null = null;
    for (let i = 0; i < nNodes; i++)
      for (let j = i + 1; j < nNodes; j++)
        if (c.find(i) !== c.find(j) && deg(i) < 2 && deg(j) < 2 && (!pick || dist(i, j) < dist(pick[0], pick[1]))) pick = [i, j];
    if (!pick)
      for (let i = 0; i < nNodes; i++)
        for (let j = i + 1; j < nNodes; j++) if (c.find(i) !== c.find(j) && (!pick || dist(i, j) < dist(pick[0], pick[1]))) pick = [i, j];
    if (!pick) break;
    links.push(pick);
  }
  if (nNodes > 3 && components(nNodes, links).count < 2) {
    /* tudo num grupo só: tira a ligação mais longa (a rede do vizinho mais
     * próximo não tem ciclos, então isso sempre separa) */
    let k = 0;
    links.forEach(([a, b], i) => dist(a, b) > dist(links[k][0], links[k][1]) && (k = i));
    links.splice(k, 1);
  }
  const groups = components(nNodes, links).count;

  /* ---- partículas finas: aglomerados nos nós, filamentos nas linhas e uma
   * névoa no volume (dá corpo à nuvem em qualquer ângulo) ---- */
  const points = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const tones = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    if (p > 0 && p % chunk === 0) yield;
    const kind = r();
    let x: number, y: number, z: number;
    if (kind < 0.4 || !links.length) {
      const [nx, ny, nz] = at(Math.floor(r() * nNodes));
      const s = 0.12 + r() * 0.24;
      x = nx + g() * s;
      y = ny + g() * s;
      z = nz + g() * s;
    } else if (kind < 0.7) {
      const [i, j] = links[Math.floor(r() * links.length)];
      const [ax, ay, az] = at(i);
      const [bx, by, bz] = at(j);
      const t = r();
      const s = 0.04 + 0.08 * Math.sin(Math.PI * t);
      x = ax + (bx - ax) * t + g() * s;
      y = ay + (by - ay) * t + g() * s;
      z = az + (bz - az) * t + g() * s;
    } else {
      const [bx, by, bz] = ball();
      x = bx * VOL.x * 1.04;
      y = by * VOL.y * 1.04;
      z = bz * VOL.z * 1.04;
    }
    points.set([x, y, z], p * 3);
    seeds[p] = r();
    tones[p] = r() < 0.32 ? 1 : 0;
    sizes[p] = 0.6 + Math.pow(r(), 3) * 1.6;
  }

  /* ---- centróide (pivô) e esfera envolvente ---- */
  const c = [0, 0, 0];
  for (let i = 0; i < nNodes; i++) for (let k = 0; k < 3; k++) c[k] += nodes[i * 3 + k] / nNodes;
  for (let i = 0; i < nNodes; i++) for (let k = 0; k < 3; k++) nodes[i * 3 + k] -= c[k];
  for (let p = 0; p < count; p++) for (let k = 0; k < 3; k++) points[p * 3 + k] -= c[k];
  /* raio: o nó mais distante + a folga de um aglomerado. As partículas que
   * passarem disso voltam para dentro (na mesma direção, entre 85% e 100%
   * do raio): nenhuma escapa da esfera, em nenhuma rotação */
  let rn = 0;
  for (let i = 0; i < nNodes; i++) rn = Math.max(rn, Math.hypot(nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2]));
  const radius = Math.max(rn, VOL.x * 0.9) + 0.4;
  const inner = radius - 0.06;
  for (let p = 0; p < count; p++) {
    const l = Math.hypot(points[p * 3], points[p * 3 + 1], points[p * 3 + 2]);
    if (l <= inner) continue;
    const f = (inner * (0.85 + 0.15 * seeds[p])) / l;
    for (let k = 0; k < 3; k++) points[p * 3 + k] *= f;
  }

  /* ---- estrelas: tela inteira (NDC com sobra) × profundidade; mais
   * estrelas longe que perto ---- */
  const stars = new Float32Array(starCount * 4);
  for (let k = 0; k < starCount; k++) {
    if (k > 0 && k % (chunk * 2) === 0) yield;
    stars[k * 4] = (r() * 2 - 1) * STAR_OVER;
    stars[k * 4 + 1] = (r() * 2 - 1) * STAR_OVER;
    stars[k * 4 + 2] = STAR_NEAR + (STAR_FAR - STAR_NEAR) * Math.pow(r(), 0.7);
    stars[k * 4 + 3] = r();
  }

  return { n: nNodes, nodes, links, groups, points, seeds, tones, sizes, count, radius, stars, starCount };
}

/* ---------- onde a nuvem cabe (px do campo) ---------- *//* ---------- onde a nuvem cabe (px do campo) ---------- */

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

/** raio da sombra do buraco negro em rs (≈ 3√3/2) */
const SHADOW_RS = 2.6;

/*
 * Onde a esfera da rede aparece (círculo em px do campo). Sempre dentro da
 * área segura: ≥ SAFE px das bordas e fora das caixas de texto (com folga).
 *  - largo: diâmetro-alvo de ~38% da largura, centrado entre o buraco negro
 *    e a coluna de texto da direita. Pode encostar no disco (a rede fica
 *    ATRÁS dele: a lente e o disco são desenhados por cima da cena), mas
 *    nunca chega à sombra.
 *  - estreito (celular): abaixo do buraco negro, sem tocar o disco.
 * Busca em grade (grossa e depois fina), sem acaso: < 1 ms.
 */
export function fitSphere(w: number, h: number, keep: Rect[]): Fit {
  const hc = holeCenter(w, h);
  const ex = EXCL_X * hc.rs, ey = EXCL_Y * hc.rs;
  const right = keep.filter((k) => k.x > w * 0.45);
  const colLeft = right.length ? Math.min(...right.map((k) => k.x)) : w * 0.62;
  const target = hc.narrow ? Math.min(w * 0.4, h * 0.3) : w * 0.19;
  const c0 = hc.narrow ? { x: w / 2, y: (hc.y + ey + h) / 2 } : { x: (hc.x + colLeft) / 2, y: h / 2 };
  /* folga de (x, y) até o obstáculo mais perto (negativa = dentro) */
  const room = (x: number, y: number) => {
    let d = Math.min(x - SAFE, y - SAFE, w - SAFE - x, h - SAFE - y);
    for (const k of keep) {
      const x0 = k.x - KEEP_PAD, y0 = k.y - KEEP_PAD, x1 = k.x + k.w + KEEP_PAD, y1 = k.y + k.h + KEEP_PAD;
      const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
      d = Math.min(d, dx || dy ? Math.hypot(dx, dy) : -Math.min(x - x0, x1 - x, y - y0, y1 - y));
    }
    if (hc.narrow) d = Math.min(d, (Math.hypot((x - hc.x) / ex, (y - hc.y) / ey) - 1) * Math.min(ex, ey));
    else d = Math.min(d, Math.hypot(x - hc.x, y - hc.y) - SHADOW_RS * 1.6 * hc.rs);
    return d;
  };
  /* nota: o tamanho até o alvo vale mais que ficar exatamente no centro-alvo */
  const score = (x: number, y: number, r: number) => Math.min(r, target) - 0.12 * Math.hypot(x - c0.x, y - c0.y);
  let best = { cx: c0.x, cy: c0.y, r: room(c0.x, c0.y), s: -Infinity };
  const scan = (x0: number, x1: number, y0: number, y1: number, step: number) => {
    for (let y = Math.max(SAFE, y0); y <= Math.min(h - SAFE, y1); y += step)
      for (let x = Math.max(SAFE, x0); x <= Math.min(w - SAFE, x1); x += step) {
        const r = room(x, y);
        const s = score(x, y, r);
        if (r > 0 && s > best.s) best = { cx: x, cy: y, r, s };
      }
  };
  scan(SAFE, w - SAFE, SAFE, h - SAFE, 16);
  scan(best.cx - 16, best.cx + 16, best.cy - 16, best.cy + 16, 2);
  return { hc, ex, ey, cx: best.cx, cy: best.cy, r: Math.max(0, Math.min(best.r, target)) };
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
  const rpx = Math.max(8, fit.r - 8); // folga para o halo dos nós
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
