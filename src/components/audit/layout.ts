/*
 * Layout determinístico do AUDIT (semente fixa): o MESMO desenho no WebGL e
 * na imagem estática do fallback.
 *
 * Um sistema só: tudo em volta de um buraco negro na origem (espaço local do
 * grupo; a cena põe o grupo onde o buraco negro aparece na tela).
 * - nós principais (um por dado de segurança): presos a posições de repouso
 *   num anel em volta do disco (region(), que depende da tela e das caixas de
 *   texto); só oscilam alguns px
 * - partículas (o movimento é calculado no vertex shader a partir daqui):
 *     0 aglomerado em volta de um nó   1 filamento entre dois nós vizinhos
 *     2 poeira em órbita no anel       3 poeira caindo em espiral até a borda
 *                                        de dentro (renasce na de fora)
 */
export const CAMERA_Z = 7.2;
export const FOV = 38;
/** meia altura visível no plano z = 0 (unidades de cena) */
export const HALF_H = CAMERA_Z * Math.tan(((FOV / 2) * Math.PI) / 180);
/** inclinação do plano da poeira (rad, em torno do eixo x) */
export const DUST_TILT = 0.95;

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
  /** pares de nós com filamento: vizinhos na volta do anel, nunca fechando o anel
   * (o nó 0 vem logo depois do maior vão — p.ex. o título — e o último, antes dele) */
  pairs: [number, number][];
  /** por partícula: position = desvio (0/1) ou (u, ângulo, h|T) (2/3); ref = (tipo, i, j, t).
   * u é normalizado (0 = borda de dentro do anel, 1 = borda de fora): o raio real
   * sai do shader (uRin/uRout), que depende do tamanho da tela */
  points: Float32Array;
  ref: Float32Array;
  seeds: Float32Array;
  tones: Float32Array;
  sizes: Float32Array;
  count: number;
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

/* filamentos fixos: (i, i+1) e (i, i+2), sem fechar o anel */
export function ringPairs(n: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) pairs.push([i, i + 1]);
  for (let i = 0; i < n - 2; i += 2) pairs.push([i, i + 2]);
  return pairs;
}

function* layoutSteps(nNodes: number, count: number, seed: number, chunk: number): Generator<void, Layout, void> {
  const r = rng(seed);
  const g = () => {
    const u = Math.max(1e-6, r());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };
  const pairs = ringPairs(nNodes);

  const points = new Float32Array(count * 3);
  const ref = new Float32Array(count * 4);
  const seeds = new Float32Array(count);
  const tones = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    if (p > 0 && p % chunk === 0) yield;
    const kind = r();
    if (kind < 0.3) {
      /* aglomerado em volta de um nó (desvio em unidades de "spread") */
      const s = 0.35 + r() * 0.65;
      points.set([g() * s, g() * s, g() * s], p * 3);
      ref.set([0, Math.floor(r() * nNodes), 0, 0], p * 4);
    } else if (kind < 0.55 && pairs.length) {
      const [i, j] = pairs[Math.floor(r() * pairs.length)];
      const t = r();
      const s = 0.1 + 0.2 * Math.sin(Math.PI * t);
      points.set([g() * s, g() * s, g() * s], p * 3);
      ref.set([1, i, j, t], p * 4);
    } else if (kind < 0.88) {
      /* órbita dentro do anel: mais densa perto da borda de dentro */
      points.set([Math.pow(r(), 1.5), r() * Math.PI * 2, g() * 0.06], p * 3);
      ref.set([2, 0, 0, 0], p * 4);
    } else {
      /* espiral: nasce perto da borda de fora, cai até a de dentro em T s
       * ("engolida": some antes do disco) e renasce na borda de fora */
      points.set([0.75 + r() * 0.25, r() * Math.PI * 2, 9 + r() * 9], p * 3);
      ref.set([3, 0, 0, 0], p * 4);
    }
    seeds[p] = r();
    tones[p] = r() < 0.32 ? 1 : 0;
    sizes[p] = 0.6 + Math.pow(r(), 3) * 1.6;
  }

  return { n: nNodes, pairs, points, ref, seeds, tones, sizes, count };
}

/* ---------- região do sistema (px do campo) ---------- */

export type Rect = { x: number; y: number; w: number; h: number };
/** folga em volta das caixas de texto (px) */
export const KEEP_PAD = 16;
/** área proibida em volta do buraco negro (disco visível + arco da lente), em rs */
export const EXCL_X = 7.4;
export const EXCL_Y = 8.6;
/** o anel vai até RING_CAP × a área proibida (sistema compacto, nunca espalhado) */
const RING_CAP = 2.5;

export type Region = {
  hc: ReturnType<typeof holeCenter>;
  /** semi-eixos da área proibida (px) */
  ex: number;
  ey: number;
  /** raio de dentro / de fora da poeira em órbita (px, no plano do disco) */
  rin: number;
  rout: number;
  margin: number;
  /** posições de repouso dos nós (px do campo) */
  homes: { x: number; y: number }[];
  /** ponto (px) dentro da região livre? (margens, textos, área proibida) */
  free(x: number, y: number): boolean;
};

/*
 * Onde o sistema cabe num campo w × h com estas caixas de texto por cima.
 * Os nós ficam num anel em volta do buraco negro: começa fora da área
 * proibida (disco + arco) e vai, em cada direção, até a 1ª margem ou caixa
 * de texto (com folga), no máximo RING_CAP × a área proibida. As direções
 * bloqueadas (p.ex. o título acima do disco) ficam vazias; os nós se
 * espalham pelas livres, em proporção ao espaço de cada uma. Determinístico.
 */
export function region(w: number, h: number, keep: Rect[], n: number, seed = 11): Region {
  const hc = holeCenter(w, h);
  const ex = EXCL_X * hc.rs, ey = EXCL_Y * hc.rs;
  const margin = Math.max(14, Math.min(24, Math.min(w, h) * 0.04));
  const inText = (x: number, y: number) => keep.some((k) => x > k.x - KEEP_PAD && x < k.x + k.w + KEEP_PAD && y > k.y - KEEP_PAD && y < k.y + k.h + KEEP_PAD);
  const inHole = (x: number, y: number) => ((x - hc.x) / ex) ** 2 + ((y - hc.y) / ey) ** 2 < 1;
  const free = (x: number, y: number) => x >= margin && y >= margin && x <= w - margin && y <= h - margin && !inText(x, y) && !inHole(x, y);

  /* alcance livre em 96 direções */
  const D = 96;
  const dirs: { a: number; r0: number; r1: number }[] = [];
  for (let k = 0; k < D; k++) {
    const a = (k / D) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const r0 = 1.12 / Math.hypot(c / ex, s / ey); // 12% de folga fora da área proibida
    const cap = r0 * RING_CAP;
    let r1 = r0;
    while (r1 < cap && free(hc.x + c * (r1 + 3), hc.y - s * (r1 + 3))) r1 += 3;
    dirs.push({ a, r0, r1 });
  }
  /* o anel começa logo depois do maior trecho bloqueado */
  const open = dirs.map((d) => d.r1 - d.r0 > 22);
  let best = -1, bestLen = 0;
  for (let k = 0; k < D; k++) {
    if (open[k]) continue;
    let len = 0;
    while (len < D && !open[(k + len) % D]) len++;
    if (len > bestLen) {
      bestLen = len;
      best = k;
    }
  }
  const start = best < 0 ? 0 : (best + bestLen) % D;
  const order = Array.from({ length: D }, (_, i) => dirs[(start + i) % D]);
  const room = order.map((d) => Math.max(0, d.r1 - d.r0 - 22));
  const total = room.reduce((a, b) => a + b, 0) || 1;

  const r = rng(seed);
  const homes: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    /* direção pelo quantil (i + 0,5)/n do espaço livre, com um pouco de acaso */
    const q = ((i + 0.5 + (r() - 0.5) * 0.5) / n) * total;
    let acc = 0, k = 0;
    while (k < D - 1 && acc + room[k] < q) acc += room[k++];
    const d = order[k];
    const a = d.a + ((r() - 0.5) * Math.PI * 2) / D;
    const rr = d.r0 + 11 + Math.max(0, d.r1 - d.r0 - 22) * (0.2 + 0.7 * r());
    homes.push({ x: hc.x + Math.cos(a) * rr, y: hc.y - Math.sin(a) * rr });
  }
  /* afasta nós muito próximos (≥ 40 px) sem sair da região */
  for (let it = 0; it < 40; it++)
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const dx = homes[b].x - homes[a].x, dy = homes[b].y - homes[a].y;
        const l = Math.hypot(dx, dy) || 0.01;
        if (l >= 40) continue;
        const f = (40 - l) / 2 / l;
        const pa = { x: homes[a].x - dx * f, y: homes[a].y - dy * f };
        const pb = { x: homes[b].x + dx * f, y: homes[b].y + dy * f };
        if (free(pa.x, pa.y)) homes[a] = pa;
        if (free(pb.x, pb.y)) homes[b] = pb;
      }
  /* poeira: do lado de fora da área proibida até o alcance típico do anel */
  const reach = order.map((d) => d.r1).sort((x, y) => x - y);
  const rin = ex * 1.05;
  const rout = Math.max(rin * 1.4, reach[Math.floor(reach.length * 0.75)]);
  return { hc, ex, ey, rin, rout, margin, homes, free };
}

/** raio externo do disco de acreção, em rs (o mesmo ROUT do shader) */
export const DISK_RS = 9;
export const DISK_VISIBLE_RS = 6.5;

/*
 * Onde fica o buraco negro num campo de w × h px. Fonte única para a cena, a
 * imagem estática e o círculo da transição (AuditReveal).
 *  - largo: terço esquerdo, na altura do meio
 *  - estreito (aspecto < 0,9 ou < 640 px): no centro do campo
 */
export function holeCenter(w: number, h: number) {
  /* < 640 px de largura é sempre o layout do celular, mesmo com o campo
   * quase quadrado (ex.: 360 × 370) */
  const narrow = w / h < 0.9 || w < 640;
  if (!narrow) return { narrow, x: w * 0.25, y: h * 0.5, rs: Math.min(h * 0.026, w * 0.018) };
  /* celular: no centro do campo (que já é só a faixa livre entre o cabeçalho
   * e o rodapé da seção), com o disco visível em ~36% da largura, para
   * sobrar anel dos lados; o arco de cima (~7,7 rs) cabe na altura */
  const rs = Math.min((w * 0.36) / (2 * DISK_VISIBLE_RS), (h / 2 - 10) / 8.8);
  return { narrow, x: w / 2, y: h / 2, rs };
}
