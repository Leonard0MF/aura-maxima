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

export type Orbit = {
  a: number;
  e: number;
  w: number;
  tilt: number;
  M0: number;
  T: number;
  /** fase original (desktop), quando M0 foi espalhada para telas em pé */
  M0base?: number;
};

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

export function makeLayout(nNodes: number, count: number, seed = 7, narrow = false): Layout {
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
  /* em pé: mesmas órbitas, só as fases iniciais espalhadas (a rede chega
   * aberta); o sorteio das partículas continua na mesma ordem */
  if (narrow) spreadPhases(orbits);
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

/* centro do buraco negro em px dentro do campo (w × h), a mesma regra da
 * cena: terço esquerdo no meio da altura; em pé (aspecto da janela < 0,9),
 * centralizado a 29% do topo do canvas. Usado pela entrada do AUDIT (AuditReveal). */
export function holeCenter(w: number, h: number) {
  const narrow = isNarrow(w, h);
  return narrow ? { narrow, x: w / 2, y: h * 0.29 } : { narrow, x: w * 0.25, y: h * 0.5 };
}

/* direção média dos nós no plano das órbitas (10 min, fases originais) */
function meanDir(orbits: Orbit[]) {
  let mx = 0, my = 0;
  const tmp = [0, 0, 0];
  for (let t = 0; t < 600; t += 4)
    for (const o of orbits) {
      orbitPos(o.M0base === undefined ? o : { ...o, M0: o.M0base }, t, tmp);
      mx += tmp[0];
      my += tmp[1];
    }
  return Math.atan2(my, mx);
}

/*
 * Fases iniciais para telas em pé (só M0 muda: tamanho, forma, inclinação e
 * período das órbitas ficam iguais). Busca, com semente fixa, a combinação
 * em que nos primeiros 40 s a rede fica centralizada, com ~75–90% da largura,
 * a maior parte dos nós na metade de baixo e nenhum apagado nas bordas.
 * Avaliado na tela de referência 390×490 (canvas de 58svh em 390×844) com o
 * enquadramento real (narrowFit, calibrado nas fases originais: a escala
 * não muda; a largura em % é a mesma em qualquer tela em pé).
 */
function spreadPhases(orbits: Orbit[]) {
  orbits.forEach((o) => (o.M0base = o.M0));
  const W = 390, H = 490, fit = narrowFit(orbits, W, H);
  const f = 1 / Math.tan(fit.vfov / 2), by = NARROW_BH_Y * fit.halfH;
  const c = Math.cos(-fit.phi), sn = Math.sin(-fit.phi);
  const r = rng(11);
  const tmp = [0, 0, 0];
  const n = orbits.length;
  const score = (M: number[]) => {
    let worst = Infinity;
    for (let t = 0; t <= 40; t += 5) {
      let lo = Infinity, hi = -Infinity, below = 0, vis = 0, sum = 0;
      for (let i = 0; i < n; i++) {
        orbitPos({ ...orbits[i], M0: M[i] }, t, tmp);
        const x = tmp[0] * c - tmp[1] * sn, y = tmp[0] * sn + tmp[1] * c;
        const X = fit.ky * y, Y = by - fit.kx * x, Z = fit.ky * tmp[2], d = CAMERA_Z - Z;
        const sx = W / 2 + ((X * f) / d) * (H / 2), sy = H / 2 - ((Y * f) / d) * (H / 2);
        if (sx < 22 || sx > W - 22 || sy < 54 || sy > H - 54) continue; // apagaria na borda
        vis++;
        sum += sx;
        lo = Math.min(lo, sx);
        hi = Math.max(hi, sx);
        if (sy > H / 2) below++;
      }
      if (!vis) return 0;
      const wd = (hi - lo) / W;
      const ws = wd < 0.75 ? (wd / 0.75) ** 4 : wd > 0.9 ? 0 : 1;
      const center = 1 - (2 * Math.abs(sum / vis - W / 2)) / W;
      worst = Math.min(worst, (0.5 * ws + 0.3 * (below / n) + 0.2 * center) * (vis / n) ** 2);
    }
    return worst;
  };
  let best = orbits.map((o) => o.M0);
  let bestS = score(best);
  for (let k = 0; k < 800; k++) {
    const M = orbits.map(() => r() * Math.PI * 2);
    const s0 = score(M);
    if (s0 > bestS) {
      bestS = s0;
      best = M;
    }
  }
  /* refino: um nó por vez, 48 fases cada, até não melhorar */
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 48; k++) {
        const M = best.slice();
        M[i] = (k / 48) * Math.PI * 2;
        const s0 = score(M);
        if (s0 > bestS + 1e-9) {
          bestS = s0;
          best = M;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  orbits.forEach((o, i) => (o.M0 = best[i]));
}

/* ---------- telas em pé (aspecto da janela < 0,9: celular e tablet em pé) ---------- */
export const NARROW_QUERY = "(max-aspect-ratio: 9/10)";
/** o mesmo critério do CSS (a janela, não o canvas, que no celular tem só ~70svh) */
export const isNarrow = (w: number, h: number) =>
  typeof matchMedia === "function" ? matchMedia(NARROW_QUERY).matches : w / h < 0.9;
/** FOV horizontal do desktop (1440×900): o celular vê a mesma largura de cena */
export const REF_HFOV = 2 * Math.atan(Math.tan(((FOV / 2) * Math.PI) / 180) * 1.6);
/** buraco negro em pé: centro em NDC y (29% do topo do canvas) e Ø do disco (9 rs) ≈ 55% da largura */
export const NARROW_BH_Y = 0.42;
export const NARROW_BH_W = 0.55;
const DISK_RS = 18;

/*
 * Enquadramento em pé: FOV vertical a partir do horizontal do desktop; escala
 * da rede separada por eixo (largura e comprimento), calculada sobre o
 * envelope das órbitas reais em projeção perspectiva, para a rede ocupar
 * ~85% da largura na metade de baixo, a qualquer momento das órbitas.
 * Grupo girado −90° (rot.z): x local (apoastro) → para baixo na tela, y local → largura.
 */
export function narrowFit(orbits: Orbit[], w: number, h: number, safe = 48) {
  const asp = w / h;
  const vfov = 2 * Math.atan(Math.tan(REF_HFOV / 2) / asp);
  const f = 1 / Math.tan(vfov / 2);
  const halfH = CAMERA_Z / f;
  const pxPerRs = (NARROW_BH_W * w) / DISK_RS;
  const bhPx = ((1 - NARROW_BH_Y) / 2) * h;
  const by = NARROW_BH_Y * halfH;
  /* posições reais dos nós ao longo de 10 min (os nós andam em grupo: o
   * envelope de todos os tempos deixaria a rede estreita a cada instante) */
  /* calibrado com as fases ORIGINAIS: espalhar as fases (spreadPhases)
   * abre a rede sem mudar a escala */
  const base = orbits.map((o) => (o.M0base === undefined ? o : { ...o, M0: o.M0base }));
  const raw: number[][] = [];
  const tmp = [0, 0, 0];
  for (let t = 0; t < 600; t += 4) for (const o of base) raw.push(orbitPos(o, t, tmp).slice());
  /* direção média dos nós: a rede é girada para que ela aponte reto para
   * baixo, centralizada sob o buraco negro */
  const phi = meanDir(orbits);
  const c = Math.cos(-phi), sn = Math.sin(-phi);
  const pts = raw.map(([x, y, z]) => [x * c - y * sn, x * sn + y * c, z]);
  const n = orbits.length;
  const pct = (a: number[], p: number) => a.sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
  let kx = 1, ky = 1;
  for (let it = 0; it < 8; it++) {
    const widths: number[] = [], down: number[] = [];
    for (let s0 = 0; s0 < pts.length; s0 += n) {
      let lo = Infinity, hi = -Infinity;
      for (let i = s0; i < s0 + n; i++) {
        const [x, y, z] = pts[i];
        const X = ky * y, Y = by - kx * x, Z = ky * z;
        const d = CAMERA_Z - Z;
        const sx = ((X * f) / d) * (h / 2);
        lo = Math.min(lo, sx);
        hi = Math.max(hi, sx);
        down.push(h / 2 - ((Y * f) / d) * (h / 2) - bhPx);
      }
      widths.push(hi - lo);
    }
    /* largura da rede a cada instante: mediana em ~85% da tela (fica entre
     * ~75 e ~90% na maior parte do tempo); comprimento: 95% das posições
     * acima da margem de baixo. O resto apaga no fade das bordas */
    ky *= (0.85 * w) / pct(widths, 0.5);
    kx *= (h - safe - 12 - bhPx) / pct(down, 0.95);
  }
  return { vfov, halfH, pxPerRs, kx, ky, bhPx, phi };
}
