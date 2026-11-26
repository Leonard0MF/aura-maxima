/*
 * Layout determinístico do AUDIT (semente fixa): o MESMO desenho no WebGL e
 * na imagem estática do fallback.
 *
 * Tudo gira em torno de um buraco negro na origem (espaço local do grupo; a
 * cena posiciona o grupo onde o buraco negro aparece na tela).
 * - nós principais (um por dado de segurança): órbitas de Kepler estáveis e
 *   lentas, elípticas, com o buraco negro num foco e o apoastro para o lado
 *   aberto da tela; a constelação fica à direita (desktop) ou abaixo (celular)
 * - partículas (o movimento é calculado no vertex shader a partir daqui):
 *     0 aglomerado em volta de um nó   1 filamento entre dois nós vizinhos
 *     2 poeira em órbita               3 poeira caindo em espiral (renasce na borda)
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

export type Orbit = { a: number; e: number; w: number; tilt: number; M0: number; T: number };

export type Layout = {
  orbits: Orbit[];
  /** pares de nós com filamento (vizinhos mais próximos no instante 0) */
  pairs: [number, number][];
  /** por partícula: position = desvio (0/1) ou (r0, a0, h|T) (2/3); ref = (tipo, i, j, t) */
  points: Float32Array;
  ref: Float32Array;
  seeds: Float32Array;
  tones: Float32Array;
  sizes: Float32Array;
  count: number;
};

/* posição do nó no instante t (s), no espaço local do grupo */
export function orbitPos(o: Orbit, t: number, out: number[] = [0, 0, 0]) {
  const M = o.M0 + (2 * Math.PI * t) / o.T;
  let E = M;
  for (let k = 0; k < 5; k++) E -= (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E));
  const x = o.a * (Math.cos(E) - o.e);
  const y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E);
  const cw = Math.cos(o.w), sw = Math.sin(o.w);
  const px = x * cw - y * sw;
  const py = x * sw + y * cw;
  out[0] = px;
  out[1] = py * Math.cos(o.tilt);
  out[2] = py * Math.sin(o.tilt);
  return out;
}

export function makeLayout(nNodes: number, count: number, seed = 7): Layout {
  const r = rng(seed);
  const g = () => {
    const u = Math.max(1e-6, r());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  };

  /* órbitas: periastro do lado do buraco negro (esquerda), apoastro aberto;
   * fases espalhadas perto do apoastro para a rede começar inteira à vista */
  const orbits: Orbit[] = [];
  for (let i = 0; i < nNodes; i++) {
    const a = 2.0 + r() * 1.3;
    const e = 0.38 + r() * 0.22;
    orbits.push({
      a,
      e,
      w: Math.PI + 0.22 + (r() - 0.5) * 0.6, // apoastro um pouco acima do eixo (o texto fica embaixo à direita)
      tilt: (r() < 0.5 ? -1 : 1) * (0.55 + r() * 0.45),
      M0: Math.PI + ((i + 0.5) / nNodes - 0.5) * 2.4 + (r() - 0.5) * 0.25,
      T: 200 * Math.pow(a / 2.6, 1.5) * (0.9 + r() * 0.2),
    });
  }
  const at = orbits.map((o) => orbitPos(o, 0));

  /* filamentos: cada nó com os 2 vizinhos mais próximos (sem repetir) */
  const pairs: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < nNodes; i++) {
    const d = at
      .map((q, j) => [j, Math.hypot(q[0] - at[i][0], q[1] - at[i][1], q[2] - at[i][2])] as const)
      .filter(([j]) => j !== i)
      .sort((x, y) => x[1] - y[1]);
    for (const [j] of d.slice(0, 2)) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push([i, j]);
      }
    }
  }

  const points = new Float32Array(count * 3);
  const ref = new Float32Array(count * 4);
  const seeds = new Float32Array(count);
  const tones = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let p = 0; p < count; p++) {
    const kind = r();
    if (kind < 0.3) {
      const s = 0.16 + r() * 0.3;
      points.set([g() * s, g() * s, g() * s], p * 3);
      ref.set([0, Math.floor(r() * nNodes), 0, 0], p * 4);
    } else if (kind < 0.55) {
      const [i, j] = pairs[Math.floor(r() * pairs.length)];
      const t = r();
      const s = 0.04 + 0.09 * Math.sin(Math.PI * t);
      points.set([g() * s, g() * s, g() * s], p * 3);
      ref.set([1, i, j, t], p * 4);
    } else if (kind < 0.88) {
      /* órbita: mais densa perto do buraco negro, rarefeita longe */
      const r0 = 0.55 + Math.pow(r(), 1.6) * 5.4;
      points.set([r0, r() * Math.PI * 2, g() * 0.08 * r0], p * 3);
      ref.set([2, 0, 0, 0], p * 4);
    } else {
      /* espiral: nasce na borda (r0 grande), cai em T segundos */
      points.set([4.6 + r() * 2.2, r() * Math.PI * 2, 9 + r() * 9], p * 3);
      ref.set([3, 0, 0, 0], p * 4);
    }
    seeds[p] = r();
    tones[p] = r() < 0.32 ? 1 : 0;
    sizes[p] = 0.6 + Math.pow(r(), 3) * 1.6;
  }

  return { orbits, pairs, points, ref, seeds, tones, sizes, count };
}

/* projeção da câmera fixa (sem rotação) para a imagem estática */
export function projectStatic(x: number, y: number, z: number, w: number, h: number) {
  const f = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
  const d = CAMERA_Z - z;
  return { x: w / 2 + ((x * f) / d) * (h / 2), y: h / 2 - ((y * f) / d) * (h / 2), s: CAMERA_Z / d };
}

/** raio externo do disco de acreção, em rs (o mesmo ROUT do shader) */
export const DISK_RS = 9;

/*
 * Onde fica o buraco negro num campo de w × h px. Fonte única para a cena e
 * para o círculo da transição (AuditReveal).
 *  - largo: terço esquerdo, na altura do meio
 *  - estreito (aspecto < 0,9 ou < 640 px): no topo, centralizado,
 *    com o disco ocupando ~35% da largura
 */
export function holeCenter(w: number, h: number) {
  /* < 640 px de largura é sempre o layout do celular, mesmo com o campo
   * quase quadrado (ex.: 360 × 370) */
  const narrow = w / h < 0.9 || w < 640;
  if (!narrow) return { narrow, x: w * 0.25, y: h * 0.5, rs: Math.min(h * 0.026, w * 0.018) };
  const rs = (w * 0.35) / (2 * DISK_RS);
  /* o arco de cima da lente sobe ~7,7 rs: cabe com folga */
  return { narrow, x: w / 2, y: Math.max(h * 0.19, 7.7 * rs + 18), rs };
}
