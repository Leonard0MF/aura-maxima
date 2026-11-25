/*
 * Mini-mapa-múndi em pontos (projeção equiretangular). Os continentes são
 * polígonos GROSSEIROS (lon, lat), desenhados à mão: servem para uma matriz
 * de pontos de ~4°, não para cartografia. Sem dependências, ~2 KB.
 */
type Poly = [number, number][];

const LAND: Poly[] = [
  // América do Norte
  [[-168, 65], [-140, 70], [-95, 72], [-80, 63], [-60, 55], [-52, 47], [-66, 44], [-75, 35], [-81, 25], [-90, 29], [-97, 26], [-105, 20], [-95, 16], [-83, 9], [-78, 8], [-85, 14], [-105, 23], [-117, 32], [-124, 40], [-124, 48], [-135, 58], [-150, 60], [-165, 60]],
  // Groenlândia
  [[-55, 60], [-45, 60], [-20, 70], [-20, 80], [-60, 82], [-70, 76], [-55, 68]],
  // América do Sul
  [[-80, 9], [-72, 12], [-60, 10], [-50, 0], [-35, -6], [-39, -15], [-48, -25], [-58, -38], [-65, -42], [-68, -55], [-75, -50], [-72, -30], [-71, -18], [-81, -6], [-80, 1]],
  // Europa
  [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [5, 58], [10, 63], [20, 70], [30, 71], [40, 67], [40, 55], [30, 45], [28, 41], [22, 37], [15, 38], [12, 44], [3, 42], [-5, 36]],
  // Grã-Bretanha
  [[-5, 50], [2, 51], [0, 55], [-3, 58], [-6, 57]],
  // África
  [[-17, 15], [-17, 21], [-10, 30], [-6, 36], [10, 37], [20, 32], [32, 31], [35, 28], [43, 12], [51, 12], [40, -2], [40, -15], [33, -27], [20, -35], [15, -25], [12, -5], [9, 4], [-8, 5], [-15, 10]],
  // Ásia
  [[26, 40], [36, 36], [35, 30], [45, 13], [58, 22], [60, 25], [67, 25], [72, 20], [78, 8], [80, 15], [88, 22], [92, 22], [98, 16], [103, 1], [105, 10], [108, 16], [107, 21], [117, 23], [122, 30], [120, 38], [122, 40], [128, 35], [130, 42], [140, 48], [142, 55], [155, 60], [163, 58], [180, 66], [180, 70], [140, 73], [110, 77], [80, 73], [68, 69], [55, 68], [45, 67], [40, 60], [40, 55], [30, 45]],
  // Japão
  [[130, 31], [135, 34], [140, 36], [142, 40], [141, 45], [139, 42], [136, 36], [131, 34]],
  // Indonésia (Sumatra–Bornéu, grosso)
  [[95, 5], [105, -6], [115, -8], [119, -4], [118, 5], [110, 2], [100, 2]],
  // Austrália
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [140, -38], [132, -32], [115, -34]],
];

function inside([x, y]: [number, number], poly: Poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/* pontos de terra em graus, a cada `step` graus, entre 58°S e 80°N */
export function landDots(step = 4) {
  const out: [number, number][] = [];
  for (let lat = 80; lat >= -58; lat -= step)
    for (let lon = -180 + step / 2; lon < 180; lon += step) if (LAND.some((p) => inside([lon, lat], p))) out.push([lon, lat]);
  return out;
}

export const LAT_TOP = 82;
export const LAT_BOTTOM = -60;
/* equiretangular recortado: lon/lat → px numa caixa w×h */
export const project = (lon: number, lat: number, w: number, h: number) => ({
  x: ((lon + 180) / 360) * w,
  y: ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * h,
});
