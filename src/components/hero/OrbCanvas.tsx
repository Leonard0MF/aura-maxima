"use client";

import { useEffect, useRef } from "react";

import { lens } from "./lens-state";
import { FRAG, VERT } from "./shaders";

type V3 = [number, number, number];

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mid = (a: V3, b: V3): V3 => norm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);

/* Icosfera não indexada + coordenadas baricêntricas (para o wireframe no shader). */
function icosphere(subdivisions: number) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v: V3[] = (
    [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ] as V3[]
  ).map(norm);
  let faces: [V3, V3, V3][] = (
    [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ] as [number, number, number][]
  ).map(([a, b, c]) => [v[a], v[b], v[c]]);
  for (let s = 0; s < subdivisions; s++) {
    const next: [V3, V3, V3][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const pos = new Float32Array(faces.length * 9);
  const bary = new Float32Array(faces.length * 9);
  faces.forEach((f, i) => {
    for (let k = 0; k < 3; k++) {
      pos.set(f[k], i * 9 + k * 3);
      bary[i * 9 + k * 3 + k] = 1;
    }
  });
  return { pos, bary, count: faces.length * 3 };
}

function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function rotation(ax: number, ay: number) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay);
  /* Ry * Rx, coluna-maior */
  return new Float32Array([cy, 0, -sy, sx * sy, cx, sx * cy, cx * sy, -sx, cx * cy]);
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

const FOV = (30 * Math.PI) / 180;
const DIST = 4;

export default function OrbCanvas({ onFail }: { onFail: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: "low-power" });
    if (!gl) {
      onFail();
      return;
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      onFail();
      return;
    }
    gl.useProgram(prog);

    const geo = icosphere(4);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bind = (name: string, data: Float32Array) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    };
    bind("aPos", geo.pos);
    bind("aBary", geo.bary);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uProj = u("uProj"), uRot = u("uRot"), uTime = u("uTime"), uScale = u("uScale");
    const uDist = u("uDist"), uMouse = u("uMouse"), uLens = u("uLens"), uDpr = u("uDpr");

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.uniform1f(uDist, DIST);

    let dpr = 1;
    let w = 0;
    let h = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniformMatrix4fv(uProj, false, perspective(FOV, w / h, 0.1, 20));
      /* diâmetro na tela ≈ min(62% da altura, 92% da largura), já descontando o displacement */
      const target = Math.min(h * 0.62, w * 0.92);
      const visibleH = 2 * DIST * Math.tan(FOV / 2);
      gl.uniform1f(uScale, ((target / 2 / h) * visibleH) / 1.18);
      gl.uniform1f(uDpr, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let visible = true;
    let mx = 0;
    let my = 0;
    const start = performance.now();
    let first = true;

    const frame = (now: number) => {
      raf = 0;
      const t = (now - start) / 1000;
      mx += (lens.mx - mx) * 0.06;
      my += (lens.my - my) * 0.06;
      gl.uniform1f(uTime, t);
      gl.uniform2f(uMouse, mx, my);
      gl.uniformMatrix3fv(uRot, false, rotation(0.35 + my * 0.25, t * 0.12 + mx * 0.45));
      gl.uniform3f(uLens, lens.x * dpr, (h - lens.y) * dpr, lens.r * dpr);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, geo.count);
      if (first) {
        first = false;
        canvas.dataset.ready = "";
      }
      schedule();
    };
    const schedule = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      schedule();
    });
    io.observe(canvas);
    const onVis = () => schedule();
    document.addEventListener("visibilitychange", onVis);
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      onFail();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
    };
  }, [onFail]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[2] size-full opacity-0 transition-opacity duration-700 data-[ready]:opacity-100"
    />
  );
}
