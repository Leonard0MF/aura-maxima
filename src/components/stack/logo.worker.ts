/*
 * Extrusão dos logos da STACK fora da main thread: a ExtrudeGeometry de um
 * logo complexo custa 50–80 ms com CPU 4× (triangulação, bisel, normais).
 * Recebe os contornos já achatados (a main thread só lê o SVG) e devolve os
 * buffers transferidos (sem cópia).
 */
import { ExtrudeGeometry, Path, Shape, Vector2 } from "three";

import { EXTRUDE, type LogoJob, type LogoOut } from "./logo-geo";

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<LogoJob>) => void) | null;
  postMessage(m: LogoOut, transfer: Transferable[]): void;
};

const pts = (a: Float32Array) => Array.from({ length: a.length / 2 }, (_, i) => new Vector2(a[i * 2], a[i * 2 + 1]));

ctx.onmessage = (e) => {
  const { id, shapes, s, y } = e.data;
  try {
    const sh = shapes.map((c) => {
      const shape = new Shape(pts(c.outer));
      shape.holes = c.holes.map((h) => new Path(pts(h)));
      return shape;
    });
    const g = new ExtrudeGeometry(sh, EXTRUDE);
    g.rotateX(-Math.PI / 2);
    g.scale(s, s, s);
    g.translate(0, y, 0);
    g.computeVertexNormals();
    const pos = g.getAttribute("position").array as Float32Array;
    const nor = g.getAttribute("normal").array as Float32Array;
    const uv = g.getAttribute("uv").array as Float32Array;
    ctx.postMessage({ id, pos, nor, uv, groups: g.groups.map((q) => ({ start: q.start, count: q.count, mi: q.materialIndex ?? 0 })) }, [pos.buffer, nor.buffer, uv.buffer]);
    g.dispose();
  } catch {
    ctx.postMessage({ id, err: true }, []);
  }
};
