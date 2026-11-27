/*
 * Geometria 3D dos logos da STACK. A main thread só lê o SVG (SVGLoader
 * precisa do DOM) e achata os contornos; a extrusão roda num Worker
 * (logo.worker). Sem Worker: o mesmo cálculo na main thread, um logo por vez.
 */
import { BufferAttribute, BufferGeometry, ExtrudeGeometry, type Shape } from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

export const EXTRUDE = { depth: 1.1, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.22, bevelSegments: 1, curveSegments: 4 };
const CURVE = EXTRUDE.curveSegments;

export type LogoJob = { id: number; shapes: { outer: Float32Array; holes: Float32Array[] }[]; s: number; y: number };
export type LogoOut =
  | { id: number; pos: Float32Array; nor: Float32Array; uv: Float32Array; groups: { start: number; count: number; mi: number }[]; err?: undefined }
  | { id: number; err: true };

function shapesOf(path: string): Shape[] {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path transform="translate(-12 12) scale(1 -1)" d="${path}"/></svg>`;
  return new SVGLoader().parse(svg).paths.flatMap((p) => p.toShapes());
}

const flat = (v: { x: number; y: number }[]) => {
  const a = new Float32Array(v.length * 2);
  v.forEach((p, i) => ((a[i * 2] = p.x), (a[i * 2 + 1] = p.y)));
  return a;
};

function local(shapes: Shape[], s: number, y: number) {
  const g = new ExtrudeGeometry(shapes, EXTRUDE);
  g.rotateX(-Math.PI / 2);
  g.scale(s, s, s);
  g.translate(0, y, 0);
  g.computeVertexNormals();
  return g;
}

let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, (o: LogoOut) => void>();
function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./logo.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<LogoOut>) => {
      waiting.get(e.data.id)?.(e.data);
      waiting.delete(e.data.id);
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const [id, done] of waiting) done({ id, err: true });
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** geometria de um logo (null: o SVG não tem forma). `s`: escala; `y`: altura da face */
export async function logoGeometry(path: string, s: number, y: number): Promise<BufferGeometry | null> {
  const shapes = shapesOf(path);
  if (!shapes.length) return null;
  const w = getWorker();
  if (w) {
    /* os mesmos pontos que a ExtrudeGeometry tiraria das curvas */
    const job: LogoJob = {
      id: ++seq,
      s,
      y,
      shapes: shapes.map((sh) => {
        const { shape, holes } = sh.extractPoints(CURVE);
        return { outer: flat(shape), holes: holes.map(flat) };
      }),
    };
    const out = await new Promise<LogoOut>((res) => {
      waiting.set(job.id, res);
      w.postMessage(job, job.shapes.flatMap((c) => [c.outer.buffer, ...c.holes.map((h) => h.buffer)]));
    });
    if (!out.err) {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(out.pos, 3));
      g.setAttribute("normal", new BufferAttribute(out.nor, 3));
      g.setAttribute("uv", new BufferAttribute(out.uv, 2));
      for (const q of out.groups) g.addGroup(q.start, q.count, q.mi);
      return g;
    }
  }
  return local(shapes, s, y);
}

/** fecha o Worker (a cena foi destruída e não há mais logos a extrudar) */
export function closeLogoWorker() {
  if (waiting.size) return;
  worker?.terminate();
  worker = undefined;
}
