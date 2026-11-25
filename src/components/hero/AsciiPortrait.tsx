"use client";

import { useEffect, useRef } from "react";

import { GLYPHS, PORTRAIT_H, PORTRAIT_MAX_W, RATIO, cellWidth, type Levels } from "@/lib/ascii/core";

import { FRAG, GRID_FRAG, VERT } from "./ascii-shader";

type Props = { src: string; aspect: number; levels: Levels; onFail: () => void };

/* Atlas: cada glifo pré-renderizado uma vez numa faixa (fillText só aqui). */
const TILE_W = 40;
const TILE_H = Math.round(TILE_W * RATIO);
const INTRO_END = 2;

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
  /* baseline equivalente a line-height 1.08em (ascent 1.02, descent 0.3) */
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

function texture(gl: WebGL2RenderingContext, unit: number, source: TexImageSource, flip: boolean) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/*
 * Retrato ASCII ao vivo: um canvas WebGL2 do tamanho do hero.
 *   passe de grade  → textura (1 texel por célula): glifo, destaque, opacidade
 *   passe por frame → atlas de glifos + embaralhamento perto do cursor + lente
 * Também é dono da interação (ponteiro, lente, passeio sozinho) e escreve
 * --lx/--ly/--lr no hero para a camada de texto da lente (PENTESTER).
 */
export default function AsciiPortrait({ src, aspect, levels, onFail }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) return onFail();
    /* WebGL emulado na CPU (SwiftShader, llvmpipe: sem GPU ou driver) conta
     * como aparelho fraco → fallback estático. `?gl=force` liga mesmo assim (testes). */
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    if (/swiftshader|llvmpipe|softpipe|software/i.test(renderer) && !location.search.includes("gl=force")) return onFail();

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
    const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

    let alive = true;
    let ready = false;
    let imgW = 1;
    const html = document.documentElement;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const intro = html.dataset.intro === "1";
    let introStart = 0;

    /* ---------- geometria + grade ---------- */
    const gridTex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let dpr = 1, W = 0, H = 0, gridCols = 0, gridRows = 0;
    const rect = { x: 0, y: 0, w: 0, h: 0 }; // px CSS, origem no topo
    let lensR = 100;
    let lastStep = -1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = box.clientWidth;
      H = box.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const cw = cellWidth(W);
      gridCols = Math.ceil(W / cw);
      gridRows = Math.ceil(H / (cw * RATIO));
      rect.h = Math.min(PORTRAIT_H * H, (PORTRAIT_MAX_W * W) / aspect);
      rect.w = rect.h * aspect;
      rect.x = (W - rect.w) / 2;
      rect.y = (H - rect.h) / 2;
      lensR = W < 640 ? 66 : 100;

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, gridTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gridCols, gridRows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gridTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      /* texels da foto por célula → nível de mipmap da amostragem */
      const lod = Math.max(0, Math.log2(imgW / (rect.w / cw)));
      for (const p of [gridProg, prog]) {
        gl.useProgram(p);
        gl.uniform1f(loc(p, "uCell"), cw * dpr);
        gl.uniform4f(loc(p, "uRect"), rect.x * dpr, (H - rect.y - rect.h) * dpr, rect.w * dpr, rect.h * dpr);
        gl.uniform1f(loc(p, "uAspect"), aspect);
        gl.uniform2f(loc(p, "uLevels"), levels.black, levels.white);
        gl.uniform1f(loc(p, "uImgLod"), lod);
        gl.uniform1f(loc(p, "uDpr"), dpr);
        /* no celular o retrato ocupa a largura toda: não esconde FULL-STACK / DEVELOPER */
        gl.uniform1f(loc(p, "uKnock"), W < 640 ? 0 : 1);
        gl.uniform2f(loc(p, "uRes"), canvas.width, canvas.height);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      lastStep = -1;
      schedule();
    };

    const drawGrid = (t: number, it: number) => {
      gl.useProgram(gridProg);
      gl.uniform1f(loc(gridProg, "uTime"), t);
      gl.uniform1f(loc(gridProg, "uIntro"), it);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, gridCols, gridRows);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
    };

    /* ---------- interação ---------- */
    const face = () => ({ x: W / 2, y: rect.y + rect.h * 0.4 });
    let lx = 0, ly = 0, tx = 0, ty = 0;
    let px = -1e4, py = -1e4, pa = 0;
    let lastInput = -Infinity;
    const t0 = performance.now();

    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (px < -1e3) {
        px = tx;
        py = ty;
      }
      lastInput = performance.now();
      schedule();
    };
    box.addEventListener("pointermove", onMove, { passive: true });
    box.addEventListener("pointerdown", onMove, { passive: true });

    let raf = 0;
    let visible = true;
    let lastDraw = 0;
    let U: Record<"time" | "ptr" | "lens", WebGLUniformLocation | null>;

    /* ~30 fps; se o frame custa caro na main thread (aparelho fraco, GL por
     * software), cai para ~16 fps sozinho em vez de travar a página */
    let cost = 0;
    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      if (now - lastDraw < (cost > 12 ? 80 : 30)) return schedule();
      lastDraw = now;
      const t = (now - t0) / 1000;
      const sinceInput = now - lastInput;
      const idle = sinceInput > 2500;
      if (idle && !reduce) {
        const f = face();
        tx = f.x + rect.w * 0.32 * Math.sin(t * 0.31);
        ty = f.y + rect.h * 0.22 * Math.sin(t * 0.47 + 1.3);
      }
      const k = idle ? 0.05 : 0.25;
      lx += (tx - lx) * k;
      ly += (ty - ly) * k;
      px += (tx - px) * 0.5;
      py += (ty - py) * 0.5;
      pa += ((sinceInput < 1200 ? 1 : 0) - pa) * 0.1;

      const it = intro ? (now - introStart) / 1000 : 99;
      const step = Math.floor(t * 6);
      if (it < INTRO_END || step !== lastStep) {
        lastStep = step;
        drawGrid(t, it);
      }
      /* a lente só abre depois que o retrato trava */
      const open = Math.min(1, Math.max(0, (it - 1.5) / 0.6));
      const r = lensR * (1 - Math.pow(1 - open, 3));
      gl.uniform1f(U.time, t);
      gl.uniform3f(U.ptr, px * dpr, (H - py) * dpr, pa);
      gl.uniform3f(U.lens, lx * dpr, (H - ly) * dpr, r * dpr);
      gl.clear(gl.COLOR_BUFFER_BIT);
      /* só sombreia onde há algo: retrato ∪ lente ∪ entorno do cursor */
      let x0 = rect.x, y0 = rect.y, x1 = rect.x + rect.w, y1 = rect.y + rect.h;
      const grow = (cx: number, cy: number, rr: number) => {
        x0 = Math.min(x0, cx - rr);
        y0 = Math.min(y0, cy - rr);
        x1 = Math.max(x1, cx + rr);
        y1 = Math.max(y1, cy + rr);
      };
      if (r > 0) grow(lx, ly, r + 26);
      if (pa > 0.01) grow(px, py, 132);
      x0 = Math.max(0, x0);
      y0 = Math.max(0, y0);
      x1 = Math.min(W, x1);
      y1 = Math.min(H, y1);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(Math.floor(x0 * dpr), Math.floor((H - y1) * dpr), Math.ceil((x1 - x0) * dpr), Math.ceil((y1 - y0) * dpr));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
      cost = cost * 0.8 + (performance.now() - now) * 0.2;

      box.style.setProperty("--lx", `${lx.toFixed(1)}px`);
      box.style.setProperty("--ly", `${ly.toFixed(1)}px`);
      box.style.setProperty("--lr", `${r.toFixed(1)}px`);
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

      const family = getComputedStyle(canvas).fontFamily;
      const img = new Image();
      img.src = src;
      const [, ok] = await Promise.all([
        document.fonts.load(`500 64px ${family}`).catch(() => {}),
        img.decode().then(
          () => true,
          () => false,
        ),
      ]);
      if (!alive) return;
      if (!ok) return onFail();

      texture(gl, 0, buildAtlas(family), false);
      texture(gl, 1, img, true);
      imgW = img.naturalWidth;
      for (const p of [gridProg, prog]) {
        gl.useProgram(p);
        gl.uniform1i(loc(p, "uImg"), 1);
      }
      gl.useProgram(prog);
      gl.uniform1i(loc(prog, "uAtlas"), 0);
      gl.uniform1i(loc(prog, "uGrid"), 2);
      U = { time: loc(prog, "uTime"), ptr: loc(prog, "uPtr"), lens: loc(prog, "uLens") };

      ro.observe(box);
      io.observe(box);
      resize();
      const f = face();
      lx = tx = f.x;
      ly = ty = f.y;
      introStart = performance.now();
      ready = true;
      schedule();
      box.dataset.live = "";
      if (intro) {
        try {
          sessionStorage.setItem("recon:intro", "1");
        } catch {}
      }
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
      delete box.dataset.live;
    };
  }, [src, aspect, levels.black, levels.white, onFail]);

  return <canvas ref={ref} aria-hidden="true" className="ascii-canvas font-mono" />;
}
