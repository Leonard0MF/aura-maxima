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
 * TIMELINE (progresso 0..1, ~4.4s na ida)
 *
 * 0.00 - 0.36   ESPAÇO: arco em direção ao destino (Atlântico, 7°N 36°W)
 * 0.36 - 0.60   REENTRADA: altitude despenca, câmera olha para frente;
 *               horizonte, vento, blur radial
 * 0.56 - 0.76   TRAVESSIA: tufos de nuvem voam contra a câmera,
 *               cada vez mais densos; véu 2D fecha a tela em ~0.76
 *               (a câmera 3D nunca desce até o oceano)
 * 0.70 - 0.79   storm liga por baixo; cena 3D some
 * 0.79 - 1.00   saída da nuvem: storm inclina até o horizonte
 * 0.90          texto da Storm entra
 */
export const FLIGHT_END = 0.74;
