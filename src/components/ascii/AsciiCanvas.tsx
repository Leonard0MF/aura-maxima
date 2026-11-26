"use client";

import { useEffect, useRef } from "react";

import { GLYPHS, RATIO, cellWidth, portraitRect, type Levels } from "@/lib/ascii/core";

import { FRAG, GRID_FRAG, VERT } from "./shader";

type Props = { src: string; aspect: number; levels: Levels; onFail: () => void };

/* Atlas: cada glifo pré-renderizado uma vez numa faixa (fillText só aqui). */
const TILE_W = 40;
const TILE_H = Math.round(TILE_W * RATIO);
const INTRO_END = 2;
/* raio do ponto âmbar da lente no espaço vazio (≈10px de diâmetro) */
const DOT_R = 5;

/* alpha da foto em baixa resolução (64 colunas): "o ponteiro está sobre a silhueta?" */
function silhouette(img: HTMLImageElement) {
  const w = 64;
  const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const a = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) a[i] = rgba[i * 4 + 3];
  return { a, w, h };
}

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

/* premultiply: o estado do upload é sempre explícito (nunca herdado de outro
 * texImage2D). A foto sobe pré-multiplicada e o shader compõe sobre branco
 * com essa conta (rgb + 1 - a); o atlas sobe como está. */
function texture(gl: WebGL2RenderingContext, unit: number, source: TexImageSource, flip: boolean, premultiply = false) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flip);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/*
 * Imagem ASCII ao vivo: um canvas WebGL2 do tamanho do bloco pai.
 *   passe de grade  → textura (1 texel por célula): glifo, destaque, opacidade
 *   passe por frame → atlas de glifos + embaralhamento perto do cursor + lente
 * Também é dono da interação (ponteiro, lente, passeio sozinho): a lente em
 * si é HTML (HeroLayer under + aro); daqui saem só --lx/--ly/--lr/--ls.
 */
export default function AsciiCanvas({ src, aspect, levels, onFail }: Props) {
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
    /* posição da página do bloco, medida no resize (sem getBoundingClientRect por evento) */
    let boxTop = 0, boxLeft = 0;
    /* PENTESTER (camada under): cada letra na largura da letra de DEVELOPER
     * (camada surface). Medido por Range no nó de texto, sem mexer no DOM da
     * superfície; refeito no resize e quando a fonte display chega. */
    /* Onde a lente fica grande: sobre a silhueta do retrato (alpha da foto
     * em baixa resolução, lido 1× no cliente) ou sobre o TEXTO de FULL-STACK /
     * DEVELOPER (retângulos medidos por Range no resize). No resto, ponto. */
    let sil: { a: Uint8ClampedArray; w: number; h: number } | null = null;
    let words: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const measureWords = () => {
      const br = box.getBoundingClientRect();
      const rg = document.createRange();
      words = [...box.querySelectorAll(".hero-layer--surface .hl")].flatMap((el) => {
        const tn = el.firstChild;
        if (!tn) return [];
        rg.selectNodeContents(tn);
        const r = rg.getBoundingClientRect();
        return [{ x0: r.left - br.left, y0: r.top - br.top, x1: r.right - br.left, y1: r.bottom - br.top }];
      });
    };
    const overTarget = (x: number, y: number) => {
      if (words.some((w) => x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1)) return true;
      if (!sil) return false;
      const u = (x - rect.x) / rect.w;
      const v = (y - rect.y) / rect.h;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
      return sil.a[Math.floor(v * sil.h) * sil.w + Math.floor(u * sil.w)] >= 128;
    };
    const fitLetters = () => {
      const src = box.querySelector(".hero-layer--surface .hl-bot")?.firstChild;
      const dst = box.querySelectorAll<HTMLElement>(".hero-layer--under .hl-ch");
      if (!src || src.nodeType !== Node.TEXT_NODE || !dst.length) return;
      const rg = document.createRange();
      const n = Math.min(dst.length, (src.textContent ?? "").length);
      for (let i = 0; i < n; i++) {
        rg.setStart(src, i);
        rg.setEnd(src, i + 1);
        dst[i].style.width = `${rg.getBoundingClientRect().width}px`;
      }
    };

    const resize = () => {
      W = box.clientWidth;
      H = box.clientHeight;
      /* DPR ≤ 1.5 e no máximo ~2,4 Mpx de framebuffer (telas grandes / 4K) */
      dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.4e6 / Math.max(1, W * H)));
      const br = box.getBoundingClientRect();
      boxTop = br.top + scrollY;
      boxLeft = br.left + scrollX;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const cw = cellWidth(W);
      gridCols = Math.ceil(W / cw);
      gridRows = Math.ceil(H / (cw * RATIO));
      Object.assign(rect, portraitRect(W, H, aspect));
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
        gl.uniform1f(loc(p, "uKnock"), W >= 640 ? 1 : 0);
        gl.uniform1f(loc(p, "uAccent"), 1);
        gl.uniform2f(loc(p, "uRes"), canvas.width, canvas.height);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      fitLetters();
      measureWords();
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

    /* ---------- interação ----------
     * Mouse (hover + ponteiro fino): a lente só existe com o ponteiro dentro
     * do hero; entra e sai com fade (raio + opacidade), já no ponto do mouse.
     * Toque: segue o dedo; sem toque, passeia devagar sobre o rosto. */
    /* começa pela media query e passa a seguir o último ponteiro usado
     * (notebook com tela de toque alterna entre os dois modos) */
    let hoverable = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const mode = (e: PointerEvent) => {
      if (e.pointerType === "mouse") hoverable = true;
      else if (e.type === "pointerdown") hoverable = false;
    };
    const face = () => ({ x: W / 2, y: rect.y + rect.h * 0.4 });
    let lx = NaN, ly = NaN, tx = 0, ty = 0;
    let px = -1e4, py = -1e4, pa = 0;
    let lastInput = -Infinity;
    let inside = false;
    let lv = 0; // visibilidade da lente 0..1 (fade)
    let big = 0; // 0 = ponto âmbar (~10px), 1 = lente inteira
    const t0 = performance.now();

    const at = (e: PointerEvent) => {
      tx = e.pageX - boxLeft;
      ty = e.pageY - boxTop;
    };
    const onMove = (e: PointerEvent) => {
      mode(e);
      at(e);
      if (px < -1e3) {
        px = tx;
        py = ty;
      }
      if (hoverable && e.pointerType === "mouse") inside = true;
      lastInput = performance.now();
      schedule();
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mode(e);
      at(e);
      /* lente invisível: nasce no ponteiro, sem deslizar de onde estava */
      if (lv < 0.05) {
        lx = tx;
        ly = ty;
      }
      inside = true;
      schedule();
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      inside = false;
      schedule();
    };
    box.addEventListener("pointermove", onMove, { passive: true });
    box.addEventListener("pointerdown", onMove, { passive: true });
    box.addEventListener("pointerenter", onEnter, { passive: true });
    box.addEventListener("pointerleave", onLeave, { passive: true });

    let raf = 0;
    let visible = true;
    let shownX = NaN, shownY = NaN, shownR = NaN, shownV = NaN, shownB = NaN, lensOn = false;
    let lastDraw = 0;
    let U: Record<"time" | "ptr", WebGLUniformLocation | null>;

    /* ~30 fps; se o frame custa caro na main thread (aparelho fraco, GL por
     * software), cai para ~16 fps sozinho em vez de travar a página */
    let cost = 0;
    let gap = 33, prevNow = performance.now(), slow = 0;
    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      if (now - lastDraw < (cost > 12 ? 80 : 30)) return schedule();
      lastDraw = now;
      const t = (now - t0) / 1000;
      const sinceInput = now - lastInput;
      const idle = sinceInput > 2500;
      /* passeio sozinho só sem mouse (toque): com mouse, a lente fica no ponteiro */
      if (!hoverable && idle && !reduce) {
        const f = face();
        tx = f.x + rect.w * 0.32 * Math.sin(t * 0.31);
        ty = f.y + rect.h * 0.22 * Math.sin(t * 0.47 + 1.3);
      }
      if (Number.isNaN(lx)) {
        const f = face();
        lx = hoverable ? tx : f.x;
        ly = hoverable ? ty : f.y;
      }
      const target = hoverable ? (inside ? 1 : 0) : 1;
      lv += (target - lv) * 0.18;
      if (Math.abs(target - lv) < 0.002) lv = target;
      /* toque: a lente está sempre sobre o rosto (inteira); mouse: inteira só
       * sobre o retrato ou as palavras, senão encolhe para o ponto */
      const bigT = !hoverable || overTarget(tx, ty) ? 1 : 0;
      big += (bigT - big) * 0.16;
      if (Math.abs(bigT - big) < 0.002) big = bigT;
      const k = !hoverable && idle ? 0.05 : 0.25;
      lx += (tx - lx) * k;
      ly += (ty - ly) * k;
      px += (tx - px) * 0.5;
      py += (ty - py) * 0.5;
      pa += ((sinceInput < 1200 ? 1 : 0) - pa) * 0.1;

      const it = intro ? (now - introStart) / 1000 : 99;
      /* tremulação a 4 Hz (a grade só é refeita nesses passos) */
      const step = Math.floor(t * 4);
      if (it < INTRO_END || step !== lastStep) {
        lastStep = step;
        drawGrid(t, it);
      }
      /* a lente só abre depois que o retrato trava */
      const open = Math.min(1, Math.max(0, (it - 1.5) / 0.6));
      const full = DOT_R + (lensR - DOT_R) * big;
      const r = full * (1 - Math.pow(1 - open, 3)) * (0.6 + 0.4 * lv) * (lv > 0 ? 1 : 0);
      gl.uniform1f(U.time, t);
      gl.uniform3f(U.ptr, px * dpr, (H - py) * dpr, pa);
      /* lente: só variáveis CSS (a camada under e o aro leem daqui) */
      const lr = Math.round(r * 10) / 10;
      if (lr !== shownR || Math.abs(lx - shownX) > 0.05 || Math.abs(ly - shownY) > 0.05 || lv !== shownV || big !== shownB) {
        shownV = lv;
        shownB = big;
        shownR = lr;
        shownX = lx;
        shownY = ly;
        const st = box.style;
        st.setProperty("--lx", `${lx.toFixed(1)}px`);
        st.setProperty("--ly", `${ly.toFixed(1)}px`);
        st.setProperty("--lr", `${lr}px`);
        st.setProperty("--ls", (lr / 100).toFixed(3));
        st.setProperty("--lo", lv.toFixed(3));
        st.setProperty("--ld", (1 - big).toFixed(3));
        if (lr > 0 && !lensOn) {
          lensOn = true;
          box.dataset.lens = "";
        }
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      /* só sombreia o retângulo do retrato (nada é desenhado fora da silhueta) */
      const x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y);
      const x1 = Math.min(W, rect.x + rect.w), y1 = Math.min(H, rect.y + rect.h);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(Math.floor(x0 * dpr), Math.floor((H - y1) * dpr), Math.ceil((x1 - x0) * dpr), Math.ceil((y1 - y0) * dpr));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
      cost = cost * 0.8 + (performance.now() - now) * 0.2;

      /* trava real (GPU lenta, GL por software mascarado pelo navegador):
       * intervalo médio entre frames > 50 ms por ~2 s → desliga e usa o estático */
      gap = gap * 0.9 + Math.min(200, now - prevNow) * 0.1;
      prevNow = now;
      const limit = cost > 12 ? 120 : 50;
      if (gap > limit && ++slow > 40) {
        alive = false;
        return onFail();
      }
      if (gap < limit) slow = 0;

      schedule();
    };

    function schedule() {
      if (!raf && ready && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(resize);
    /* fora da tela: loop parado (nenhum rAF agendado) */
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      prevNow = performance.now();
      schedule();
    });
    const onVis = () => {
      prevNow = performance.now();
      schedule();
    };
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
      sil = silhouette(img);
      texture(gl, 1, img, true, true);
      imgW = img.naturalWidth;
      for (const p of [gridProg, prog]) {
        gl.useProgram(p);
        gl.uniform1i(loc(p, "uImg"), 1);
      }
      gl.useProgram(prog);
      gl.uniform1i(loc(prog, "uAtlas"), 0);
      gl.uniform1i(loc(prog, "uGrid"), 2);
      U = { time: loc(prog, "uTime"), ptr: loc(prog, "uPtr") };

      ro.observe(box);
      io.observe(box);
      resize();
      /* a fonte display pode chegar depois: remede as letras */
      void document.fonts.ready.then(() => {
        if (!alive) return;
        fitLetters();
        measureWords();
      });
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
      box.removeEventListener("pointerenter", onEnter);
      box.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("webglcontextlost", onLost);
      document.removeEventListener("visibilitychange", onVis);
      delete box.dataset.live;
      delete box.dataset.lens;
      /* desmontado de vez (bloco saiu de cena): libera o contexto já, sem esperar o GC */
      setTimeout(() => {
        if (!canvas.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
      }, 0);
    };
  }, [src, aspect, levels.black, levels.white, onFail]);

  return <canvas ref={ref} aria-hidden="true" className="ascii-canvas font-mono" />;
}
