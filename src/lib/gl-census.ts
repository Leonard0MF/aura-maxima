import type { WebGLRenderer } from "three";

/*
 * Desenvolvimento: a cada retomada do loop, loga no console quantos
 * programas WebGL e geometrias a cena tem e avisa se apareceu algum novo
 * desde a última vez. Depois da 1ª entrada, não deve surgir nenhum (a cena
 * é criada uma vez e só pausa/retoma). Em produção não faz nada.
 */
const seen = new Map<string, { programs: number; geometries: number; textures: number }>();
export function glCensus(renderer: WebGLRenderer, label: string) {
  if (process.env.NODE_ENV === "production") return;
  const now = {
    programs: renderer.info.programs?.length ?? 0,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };
  const before = seen.get(label);
  seen.set(label, now);
  if (!before) {
    console.info(`[gl] ${label}: criada · ${now.programs} programas · ${now.geometries} geometrias · ${now.textures} texturas`);
    return;
  }
  const extra = (Object.keys(now) as (keyof typeof now)[]).filter((k) => now[k] > before[k]).map((k) => `+${now[k] - before[k]} ${k}`);
  if (extra.length) console.warn(`[gl] ${label}: NOVO ao retomar: ${extra.join(", ")}`);
  else console.info(`[gl] ${label}: retomada sem criar nada (${now.programs} programas, ${now.geometries} geometrias)`);
}
