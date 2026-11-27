/*
 * Constantes e tipos da extrusão dos logos, compartilhados pela main thread
 * (logo-geo) e pelo Worker (logo.worker). Este módulo NÃO cria o Worker:
 * se o Worker importasse logo-geo, o bundler seguiria o `new Worker(...)`
 * de dentro dele de novo, num ciclo sem fim.
 */
export const EXTRUDE = { depth: 1.1, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.22, bevelSegments: 1, curveSegments: 4 };

export type LogoJob = { id: number; shapes: { outer: Float32Array; holes: Float32Array[] }[]; s: number; y: number };
export type LogoOut =
  | { id: number; pos: Float32Array; nor: Float32Array; uv: Float32Array; groups: { start: number; count: number; mi: number }[]; err?: undefined }
  | { id: number; err: true };
