/*
 * Estado compartilhado da viagem.
 *
 * O DOM (Experience) e a cena 3D (SpaceScene) leem o mesmo
 * progresso 0..1. É um objeto mutável de propósito: muda a
 * cada frame e não deve causar re-render no React.
 */
export const travel = {
  progress: 0,
  /* Posição do mouse normalizada (-1..1), para o parallax do hero. */
  pointerX: 0,
  pointerY: 0,
};

export const clamp = (v: number, a = 0, b = 1) => Math.min(Math.max(v, a), b);
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/*
 * TIMELINE (progresso 0..1)
 *
 * 0.00 - 0.74   VOO: a câmera sai do espaço e desce até o topo
 *               das nuvens. Distância cai exponencialmente
 *               (velocidade relativa constante = sensação real
 *               de aproximação). No fim ela "nivela" e olha
 *               para o horizonte curvo da Terra.
 * 0.56 - 0.68   halo azul nas bordas (2D)
 * 0.62 - 0.92   folhas de nuvem (brancas -> azul de tempestade)
 * 0.64 - 0.80   véu: branco -> ardósia -> azul do storm
 * 0.70 - 0.80   storm liga por baixo do véu sólido
 * 0.82 - 1.00   DESCIDA: teto de nuvem sobe e sai, storm inclina
 * 0.92          texto da Storm entra
 */
export const FLIGHT_END = 0.74;
