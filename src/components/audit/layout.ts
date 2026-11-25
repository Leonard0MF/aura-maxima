/*
 * Layout determinístico da constelação (semente fixa): o MESMO desenho no
 * WebGL e na imagem estática do fallback. Coordenadas em unidades de cena,
 * centradas na origem; a rede é mais larga que alta (a seção é ~2:1).
 *
 * - nós principais: um por dado de segurança, espalhados numa elipse
 * - partículas: aglomerados em volta dos nós, filamentos entre nós ligados
 *   e uma poeira de fundo
 * - linhas: só entre nós principais (vizinhos mais próximos)
 */
export const SPREAD = { x: 3.4, y: 1.5, z: 1.4 };

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
  /** nós principais: posição xyz (3 por nó) */
  nodes: Float32Array;
  /** pares de índices de nós ligados por linha */
  links: [number, number][];
  /** partículas: posição xyz, semente (0..1), tom (0 = off-white, 1 = âmbar), tamanho */
  points: Float32Array;
  seeds: Float32Array;
  tones: Float32Array;
  sizes: Float32Array;
  count: number;
};

export function makeLayout(nNodes: number, count: number, seed = 7): Layout {
  const r = rng(seed);
  const g = () => {
    // gaussiana (Box-Muller)
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
    const kind = r();
    let x: number, y: number, z: number;
    if (kind < 0.42) {
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

  return { nodes, links, points, seeds, tones, sizes, count };
}

/* projeção simples (câmera fixa, sem rotação) para a imagem estática */
export const CAMERA_Z = 7.2;
export const FOV = 38;
export function projectStatic(x: number, y: number, z: number, w: number, h: number) {
  const f = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
  const d = CAMERA_Z - z;
  return { x: w / 2 + ((x * f) / d) * (h / 2), y: h / 2 - ((y * f) / d) * (h / 2), s: CAMERA_Z / d };
}
