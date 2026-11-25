"use client";

import { useEffect, useRef } from "react";

import { FIT, GLYPHS, GRID, RATIO } from "@/lib/ascii/core";

import { FRAG, GRID_FRAG, VERT } from "./ascii-shader";

type Props = { src: string | null; aspect: number; onFail: () => void };

/* Atlas: cada glifo pré-renderizado uma vez numa faixa (fillText só aqui). */
const TILE_W = 40;
const TILE_H = Math.round(TILE_W * RATIO);

function buildAtlas(family: string) {
  const c = document.createElement("canvas");
  c.width = TILE_W * GLYPHS.length;
  c.height = TILE_H;
  const ctx = c.getContext("2d")!;
  const fontPx = TILE_W / 0.6;
  ctx.font = `500 ${fontPx}px ${family}`;
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  /* baseline do <pre> com line-height 1.08em (ascent 1.02, descent 0.3) */
  const base = fontPx * 0.9;
  [...GLYPHS].forEach((ch, i) => ctx.fillText(ch, i * TILE_W + TILE_W / 2, base));
  return c;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

function texture(gl: WebGL2RenderingContext, unit: number, source: TexImageSource | null, flip: boolean) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
  if (source) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([233, 231, 226, 255]));
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/*
 * Retrato ASCII ao vivo: um canvas WebGL2, um draw de tela cheia por frame.
 * Também é dono da interação (ponteiro, lente, passeio sozinho), para que
 * nada disso pese no JS inicial: este módulo só chega depois do primeiro paint.
 */
export default function AsciiPortrait({ src, aspect, onFail }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) return onFail();

    /* Compila sem consultar o status: com KHR_parallel_shader_compile o
     * driver trabalha em paralelo e a main thread não trava (ver init). */
    const link = (fs: string) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      return p;
    };
    const prog = link(FRAG);
    const gridProg = link(GRID_FRAG);
    const parallel = gl.getExtension("KHR_parallel_shader_compile");
    gl.bindVertexArray(gl.createVertexArray());
    gl.clearColor(0, 0, 0, 0);

    /* uniforms comuns aos dois programas */
    const setShared = (p: WebGLProgram, hasImg: boolean, cols: number, lod: number) => {
      gl.useProgram(p);
      gl.uniform1i(gl.getUniformLocation(p, "uImg"), 1);
      gl.uniform1i(gl.getUniformLocation(p, "uHasImg"), hasImg ? 1 : 0);
      gl.uniform1f(gl.getUniformLocation(p, "uAspect"), aspect);
      gl.uniform1f(gl.getUniformLocation(p, "uCols"), cols);
      gl.uniform1f(gl.getUniformLocation(p, "uImgLod"), lod);
    };

    const u = (n: string) => gl.getUniformLocation(prog, n);
    let U: Record<"res" | "time" | "dpr" | "ptr" | "lens", WebGLUniformLocation | null>;

    /* grade de glifos base: textura cols × linhas, refeita só no resize */
    const gridTex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let hasImg = false;
    let gridRows = 0;
    let gridCols = 0;
    let lastStep = -1;
    const gridTime = gl.getUniformLocation(gridProg, "uTime");
    const allocGrid = (cols: number) => {
      gridCols = cols;
      gridRows = Math.ceil(canvas.height / ((canvas.width / cols) * RATIO));
      const lod = Math.max(0, Math.log2(imgW / (FIT * cols)));
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, gridTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, gridRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gridTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      setShared(gridProg, hasImg, cols, lod);
      setShared(prog, hasImg, cols, lod);
      lastStep = -1;
    };
    /* glifos base + tremulação; o canvas inteiro só lê esta textura */
    const drawGrid = (t: number) => {
      gl.useProgram(gridProg);
      gl.uniform1f(gridTime, t);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, gridCols, gridRows);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
    };

    let alive = true;
    let doneTimer: ReturnType<typeof setTimeout> | undefined;
    let ready = false;
    let imgW = 1;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wideMq = matchMedia("(min-width: 1024px)");

    /* geometria */
    let dpr = 1, W = 0, H = 0, cols: number = GRID.narrow;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = box.clientWidth;
      H = box.clientHeight;
      cols = wideMq.matches ? GRID.wide : GRID.narrow;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      allocGrid(cols);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.res, canvas.width, canvas.height);
      gl.uniform1f(U.dpr, dpr);
      lensR = W < 520 ? 70 : 100;
      schedule();
    };

    /* rosto ≈ 69% da altura da imagem, a partir da base */
    const face = () => ({ x: W * 0.5, y: H - 0.69 * ((FIT * W) / aspect) });

    /* interação */
    let lensR = 100;
    let lx = 0, ly = 0, tx = 0, ty = 0;
    let px = -1e4, py = -1e4, pa = 0;
    let lastInput = -Infinity;
    const t0 = performance.now();

    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (px < -1e3) { px = tx; py = ty; }
      lastInput = performance.now();
      schedule();
    };
    box.addEventListener("pointermove", onMove, { passive: true });
    box.addEventListener("pointerdown", onMove, { passive: true });

    let raf = 0;
    let visible = true;
    /* ~30 fps: o efeito não precisa de mais e o custo por frame cai pela metade */
    let lastDraw = 0;
    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      if (now - lastDraw < 30) return schedule();
      lastDraw = now;
      const t = (now - t0) / 1000;
      const sinceInput = now - lastInput;
      const idle = sinceInput > 2500;
      if (idle && !reduce) {
        const f = face();
        tx = f.x + W * 0.24 * Math.sin(t * 0.31);
        ty = f.y + H * 0.16 * Math.sin(t * 0.47 + 1.3);
      }
      const k = idle ? 0.05 : 0.25;
      lx += (tx - lx) * k;
      ly += (ty - ly) * k;
      px += (tx - px) * 0.5;
      py += (ty - py) * 0.5;
      pa += ((sinceInput < 1200 ? 1 : 0) - pa) * 0.1;

      const step = Math.floor(t * 6);
      if (step !== lastStep) {
        lastStep = step;
        drawGrid(t);
      }
      gl.uniform1f(U.time, t);
      gl.uniform3f(U.ptr, px * dpr, (H - py) * dpr, pa);
      gl.uniform3f(U.lens, lx * dpr, (H - ly) * dpr, lensR * dpr);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      schedule();
    };

    function schedule() {
      if (!raf && ready && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      schedule();
    });
    const onVis = () => schedule();
    const onLost = (e: Event) => {
      e.preventDefault();
      alive = false;
      onFail();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    document.addEventListener("visibilitychange", onVis);

    (async () => {
      if (parallel) {
        await new Promise<void>((done) => {
          const poll = () =>
            !alive || [prog, gridProg].every((p) => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))
              ? done()
              : setTimeout(poll, 32);
          poll();
        });
      }
      if (!alive) return;
      if (![prog, gridProg].every((p) => gl.getProgramParameter(p, gl.LINK_STATUS))) return onFail();
      U = { res: u("uRes"), time: u("uTime"), dpr: u("uDpr"), ptr: u("uPtr"), lens: u("uLens") };
      gl.useProgram(prog);
      gl.uniform1i(u("uAtlas"), 0);
      gl.uniform1i(u("uGrid"), 2);

      const family = getComputedStyle(box).fontFamily;
      await document.fonts.load(`500 64px ${family}`).catch(() => {});
      if (!alive) return;
      texture(gl, 0, buildAtlas(family), false);
      let img: HTMLImageElement | null = null;
      if (src) {
        img = new Image();
        img.src = src;
        await img.decode().catch(() => (img = null));
        if (!alive) return;
      }
      texture(gl, 1, img, true);
      if (img) {
        imgW = img.naturalWidth;
        hasImg = true;
      }
      ro.observe(box);
      io.observe(box);
      wideMq.addEventListener("change", resize);
      resize();
      const f = face();
      lx = tx = f.x;
      ly = ty = f.y;
      ready = true;
      schedule();
      requestAnimationFrame(() => {
        if (!alive) return;
        box.dataset.live = "";
        /* depois do crossfade, o <pre> sai do layout (está invisível e aria-hidden) */
        doneTimer = setTimeout(() => (box.dataset.done = ""), 700);
      });
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      box.removeEventListener("pointermove", onMove);
      box.removeEventListener("pointerdown", onMove);
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", onVis);
      wideMq.removeEventListener("change", resize);
      clearTimeout(doneTimer);
      delete box.dataset.live;
      delete box.dataset.done;
    };
  }, [src, aspect, onFail]);

  return <canvas ref={ref} aria-hidden="true" className="ascii-canvas" />;
}
