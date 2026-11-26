"use client";

import { useEffect, useRef } from "react";

import { BG_SUB, ENIGMA_ALPHA, GLYPHS, RATIO, cellWidth, portraitRect, type Levels } from "@/lib/ascii/core";

import { introSkipped } from "@/lib/intro";

import { createIntroWords } from "./introWords";
import { FRAG, GRID_FRAG, INTRO_FS, INTRO_VS, VERT } from "./shader";

export type BgImage = { src: string; aspect: number; levels: Levels };
type Props = { src: string; aspect: number; levels: Levels; bg?: BgImage; onFail: () => void };

/* Atlas: cada glifo pré-renderizado uma vez numa faixa (fillText só aqui). */
const TILE_W = 40;
const TILE_H = Math.round(TILE_W * RATIO);
/* intro "descriptografia" (escala do desktop, ≤ 2,2 s; o celular comprime
 * para ≤ 1,8 s): voo dos glifos até FLY_END, metadados e lente a partir de
 * META_AT; termina em INTRO_END (um frame de folga antes do limite) */
const INTRO_END = 2.15;
const FLY_END = 1.45;
const META_AT = 1.6;
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
/*
 * Guard da intro no módulo: uma intro por carga de página, de UMA montagem.
 * No dev o StrictMode monta → desmonta → monta; a 1ª montagem só reserva a
 * vez (introOwner) e a devolve na limpeza se não chegou a começar. A flag
 * de sessão só é gravada quando a animação termina ou o usuário a pula.
 */
let introOwner: object | null = null;
let introSeen = false;
const markIntroSeen = () => {
  introSeen = true;
  try {
    sessionStorage.setItem("recon:intro", "1");
  } catch {}
};

export default function AsciiCanvas({ src, aspect, levels, bg, onFail }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const box = canvas?.parentElement;
    if (!canvas || !box) return;
    const html = document.documentElement;
    /* por que a intro não rodou (lib/intro: data-intro-why e console no dev) */
    const skipped = introSkipped;
    const fail = (why: string) => {
      skipped(why);
      onFail();
    };
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) return fail("error");
    /* WebGL emulado na CPU (SwiftShader, llvmpipe: sem GPU ou driver) conta
     * como aparelho fraco → fallback estático. `?gl=force` liga mesmo assim (testes). */
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    if (/swiftshader|llvmpipe|softpipe|software/i.test(renderer) && !location.search.includes("gl=force")) return fail("no-gpu");

    /* Compila sem consultar o status: com KHR_parallel_shader_compile o
     * driver trabalha em paralelo e a main thread não trava (ver init). */
    const link = (fs: string, vs = VERT) => {
      const p = gl.createProgram()!;
      gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
      gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      return p;
    };
    const prog = link(FRAG);
    const gridProg = link(GRID_FRAG);
    /* intro: só na 1ª carga da sessão (o boot marca data-intro="pending" e anota o
     * motivo quando não marca; um clique/tecla/rolagem antes daqui já a
     * cancelou). ?intro=1 força, ?intro=0 desliga. */
    const token = {};
    let intro = html.dataset.intro === "pending" && !introSeen && !introOwner;
    if (intro) introOwner = token;
    else if (!introOwner) skipped(html.dataset.introWhy || (introSeen ? "session" : "input"));
    const introProg = intro ? link(INTRO_FS, INTRO_VS) : null;
    const parallel = gl.getExtension("KHR_parallel_shader_compile");
    gl.bindVertexArray(gl.createVertexArray());
    gl.clearColor(0, 0, 0, 0);
    const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);

    let alive = true;
    let ready = false;
    let imgW = 1;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let introStart = 0;
    let started = false; // a intro chegou a rodar (data-intro="run")
    /* 1: falta desenhar o 1º quadro da intro; 2: desenhado, "run" no próximo
     * frame (a capa e o campo de glifos do servidor só saem com ele na tela) */
    let runMark = 0;
    /* celular: a mesma sequência em 1,8 s (u = tempo na escala do desktop) */
    const ik = box.clientWidth < 640 ? 1.75 / INTRO_END : 1;
    let words: ReturnType<typeof createIntroWords> | null = null;
    let metaOn = false;
    let introCounts = { p: 0, e: 0, ex: 0, ey: 0 };
    /* seen: a animação foi vista até o fim ou pulada pelo usuário (grava a sessão) */
    const finishIntro = (seen = false) => {
      if (!intro) return;
      intro = false;
      if (seen) markIntroSeen();
      if (introOwner === token) introOwner = null;
      words?.destroy();
      words = null;
      html.dataset.introMeta = "";
      html.dataset.intro = "done";
      for (const ev of SKIP) removeEventListener(ev, skip);
    };
    /* qualquer clique, tecla ou rolagem completa a animação na hora */
    const skip = () => {
      if (!intro) return;
      html.dataset.introSkip = "";
      introStart = performance.now() - INTRO_END * ik * 1000 - 1;
      finishIntro(started);
      schedule();
    };
    const SKIP = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    /* testes (?introdebug): congela a intro num instante u */
    let seekU = -1;
    if (location.search.includes("introdebug"))
      (window as unknown as { __intro: unknown }).__intro = {
        seek: (v: number) => {
          seekU = v;
          schedule();
        },
      };
    if (intro) for (const ev of SKIP) addEventListener(ev, skip, { passive: true });

    /* ---------- geometria + grade ---------- */
    const gridTex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let dpr = 1, W = 0, H = 0, gridCols = 0, gridRows = 0;
    const rect = { x: 0, y: 0, w: 0, h: 0 }; // px CSS, origem no topo
    /* Enigma (fundo): mesma grade, atrás do retrato; sem ela, uHas2 = 0 */
    const rect2 = { x: 0, y: 0, w: 0, h: 0, alpha: 0 };
    let has2 = false, img2W = 1;
    let sil2: { a: Uint8ClampedArray; w: number; h: number } | null = null;
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
    let wordRects: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const measureWords = () => {
      const br = box.getBoundingClientRect();
      const rg = document.createRange();
      wordRects = [...box.querySelectorAll(".hero-layer--surface .hl")].flatMap((el) => {
        const tn = el.firstChild;
        if (!tn) return [];
        rg.selectNodeContents(tn);
        const r = rg.getBoundingClientRect();
        return [{ x0: r.left - br.left, y0: r.top - br.top, x1: r.right - br.left, y1: r.bottom - br.top }];
      });
    };
    const inSil = (m: typeof sil, r: { x: number; y: number; w: number; h: number }, x: number, y: number) => {
      if (!m) return false;
      const u = (x - r.x) / r.w;
      const v = (y - r.y) / r.h;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
      return m.a[Math.floor(v * m.h) * m.w + Math.floor(u * m.w)] >= 128;
    };
    /* lente sobre a Enigma (e não sobre o retrato, que fica por cima) */
    const overEnigma = (x: number, y: number) => has2 && !inSil(sil, rect, x, y) && inSil(sil2, rect2, x, y);
    const overTarget = (x: number, y: number) => {
      if (wordRects.some((w) => x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1)) return true;
      return inSil(sil, rect, x, y) || overEnigma(x, y);
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
      /* Enigma: a caixa do CSS (.hero-enigma-box), medida no DOM */
      const eb = bg ? box.querySelector<HTMLElement>(".hero-layer--surface .hero-enigma-box") : null;
      if (eb) {
        const hb = box.getBoundingClientRect(), er = eb.getBoundingClientRect();
        Object.assign(rect2, { x: er.left - hb.left, y: er.top - hb.top, w: er.width, h: er.height, alpha: ENIGMA_ALPHA });
      }
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
      for (const p of introProg ? [gridProg, prog, introProg] : [gridProg, prog]) {
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
        gl.uniform1f(loc(p, "uHas2"), has2 ? 1 : 0);
        if (has2 && bg) {
          gl.uniform4f(loc(p, "uRect2"), rect2.x * dpr, (H - rect2.y - rect2.h) * dpr, rect2.w * dpr, rect2.h * dpr);
          gl.uniform2f(loc(p, "uLevels2"), bg.levels.black, bg.levels.white);
          gl.uniform1f(loc(p, "uImg2Lod"), Math.max(0, Math.log2(img2W / (rect2.w / cw))));
        }
      }
      if (introProg) {
        /* instâncias do voo: a grade inteira do retrato e a grade fina da Enigma */
        const ce = cw * dpr * BG_SUB, he = ce * RATIO;
        const ex = Math.floor((rect2.x * dpr) / ce), ey = Math.floor(((H - rect2.y - rect2.h) * dpr) / he);
        introCounts = { p: gridCols * gridRows, e: 0, ex: 0, ey: 0 };
        if (has2) {
          introCounts.ex = Math.ceil((rect2.w * dpr) / ce) + 2;
          introCounts.ey = Math.ceil((rect2.h * dpr) / he) + 2;
          introCounts.e = introCounts.ex * introCounts.ey;
        }
        gl.useProgram(introProg);
        gl.uniform2f(loc(introProg, "uE0"), ex, ey);
        gl.uniform1f(loc(introProg, "uAlpha2"), rect2.alpha);
        const f = face();
        gl.uniform2f(loc(introProg, "uFace"), f.x * dpr, (H - f.y) * dpr);
        words?.setup();
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      fitLetters();
      measureWords();
      lastStep = -1;
      schedule();
    };

    const drawGrid = (t: number) => {
      gl.useProgram(gridProg);
      gl.uniform1f(loc(gridProg, "uTime"), t);
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
    let U: Record<"time" | "ptr" | "alpha2", WebGLUniformLocation | null>;

    /* ~30 fps; se o frame custa caro na main thread (aparelho fraco, GL por
     * software), cai para ~16 fps sozinho em vez de travar a página */
    let cost = 0;
    let gap = 33, prevNow = performance.now(), slow = 0;
    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      /* ~30 fps; na intro, todo frame */
      if (!intro && now - lastDraw < (cost > 12 ? 80 : 30)) return schedule();
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

      /* u: segundos da intro na escala do desktop (99 = sem intro) */
      const u = seekU >= 0 ? seekU : introStart && (intro || now - introStart < INTRO_END * ik * 1000) ? Math.max(0, now - introStart) / (1000 * ik) : 99;
      /* tremulação a 4 Hz (a grade só é refeita nesses passos) */
      const step = Math.floor(t * 4);
      if (step !== lastStep) {
        lastStep = step;
        drawGrid(t);
      }
      if (intro) {
        if (words && !words.draw(u)) {
          words.destroy();
          words = null;
        }
        /* metadados, navegação e idiomas entram em sequência; a lente acorda */
        if (u >= META_AT && !metaOn) {
          metaOn = true;
          html.dataset.introMeta = "";
          box.querySelector<HTMLElement>(".lens-ring")?.setAttribute("data-wake", "");
        }
        if (u >= INTRO_END) finishIntro(true);
      }
      /* a lente abre junto com os metadados (sem intro: já aberta) */
      const open = u >= 99 ? 1 : Math.min(1, Math.max(0, (u - META_AT) / (INTRO_END - META_AT)));
      const full = DOT_R + (lensR - DOT_R) * big;
      const r = full * (1 - Math.pow(1 - open, 3)) * (0.6 + 0.4 * lv) * (lv > 0 ? 1 : 0);
      gl.uniform1f(U.time, t);
      gl.uniform1f(U.alpha2, rect2.alpha);
      /* embaralhamento sob o ponteiro: efeito de cursor, só com mouse (no toque não há cursor) */
      gl.uniform3f(U.ptr, px * dpr, (H - py) * dpr, hoverable ? pa : 0);
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
        /* legenda da Enigma: só com a lente (mouse) sobre ela */
        const onE = hoverable && lv > 0.5 && big > 0.5 && overEnigma(lx, ly);
        if (onE !== ("enigma" in box.dataset)) box.toggleAttribute("data-enigma", onE);
        if (lr > 0 && !lensOn) {
          lensOn = true;
          box.dataset.lens = "";
        }
      }
      gl.clear(gl.COLOR_BUFFER_BIT);
      /* só sombreia os retângulos do retrato e da Enigma (nada fora das silhuetas) */
      const x0 = Math.max(0, Math.min(rect.x, has2 ? rect2.x : rect.x)), y0 = Math.max(0, Math.min(rect.y, has2 ? rect2.y : rect.y));
      const x1 = Math.min(W, Math.max(rect.x + rect.w, has2 ? rect2.x + rect2.w : 0)), y1 = Math.min(H, Math.max(rect.y + rect.h, has2 ? rect2.y + rect2.h : 0));
      if (introProg && u < FLY_END) {
        /* voo: cada glifo é um quad instanciado, da origem aleatória à célula */
        gl.useProgram(introProg);
        gl.uniform1f(loc(introProg, "uFly"), u);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.uniform1i(loc(introProg, "uMode"), 0);
        gl.uniform1i(loc(introProg, "uCols"), gridCols);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, introCounts.p);
        if (introCounts.e) {
          gl.uniform1i(loc(introProg, "uMode"), 1);
          gl.uniform1i(loc(introProg, "uCols"), introCounts.ex);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, introCounts.e);
        }
        gl.disable(gl.BLEND);
        gl.useProgram(prog);
      } else {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(Math.floor(x0 * dpr), Math.floor((H - y1) * dpr), Math.ceil((x1 - x0) * dpr), Math.ceil((y1 - y0) * dpr));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.SCISSOR_TEST);
      }
      if (runMark === 1 && intro) {
        runMark = 2;
        requestAnimationFrame(() => {
          if (intro && html.dataset.intro === "pending") html.dataset.intro = "run";
        });
      }
      cost = cost * 0.8 + (performance.now() - now) * 0.2;

      /* trava real (GPU lenta, GL por software mascarado pelo navegador):
       * intervalo médio entre frames > 50 ms por ~2 s → desliga e usa o estático */
      gap = gap * 0.9 + Math.min(200, now - prevNow) * 0.1;
      prevNow = now;
      const limit = cost > 12 ? 120 : 50;
      if (gap > limit && ++slow > 40) {
        alive = false;
        if (intro) skipped("slow");
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

    const progs = introProg ? [prog, gridProg, introProg] : [prog, gridProg];
    (async () => {
      if (parallel) {
        await new Promise<void>((done) => {
          const poll = () =>
            !alive || progs.every((p) => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))
              ? done()
              : setTimeout(poll, 32);
          poll();
        });
      }
      if (!alive) return;
      if (![prog, gridProg].every((p) => gl.getProgramParameter(p, gl.LINK_STATUS))) return fail("error");
      /* intro que não compilou: segue sem ela */
      if (introProg && !gl.getProgramParameter(introProg, gl.LINK_STATUS)) {
        intro = false;
        skipped("error");
      }

      const family = getComputedStyle(canvas).fontFamily;
      const img = new Image();
      img.src = src;
      /* Enigma: opcional (se falhar, o retrato segue sozinho) */
      const img2 = bg ? new Image() : null;
      if (img2 && bg) img2.src = bg.src;
      const [, ok, ok2] = await Promise.all([
        document.fonts.load(`500 64px ${family}`).catch(() => {}),
        img.decode().then(
          () => true,
          () => false,
        ),
        img2 ? img2.decode().then(() => true, () => false) : false,
      ]);
      if (!alive) return;
      if (!ok) return onFail();

      texture(gl, 0, buildAtlas(family), false);
      sil = silhouette(img);
      texture(gl, 1, img, true, true);
      imgW = img.naturalWidth;
      if (img2 && ok2) {
        texture(gl, 3, img2, true, true);
        sil2 = silhouette(img2);
        img2W = img2.naturalWidth;
        has2 = true;
      }
      for (const p of introProg ? [gridProg, prog, introProg] : [gridProg, prog]) {
        gl.useProgram(p);
        gl.uniform1i(loc(p, "uImg"), 1);
        gl.uniform1i(loc(p, "uImg2"), 3);
      }
      if (introProg) {
        gl.useProgram(introProg);
        gl.uniform1i(loc(introProg, "uAtlas"), 0);
        gl.uniform1i(loc(introProg, "uGrid"), 2);
      }
      gl.useProgram(prog);
      gl.uniform1i(loc(prog, "uAtlas"), 0);
      gl.uniform1i(loc(prog, "uGrid"), 2);
      U = { time: loc(prog, "uTime"), ptr: loc(prog, "uPtr"), alpha2: loc(prog, "uAlpha2") };

      /* intro: palavras num canvas 2D por cima do texto real; a capa de papel
       * do servidor (data-intro="pending") sai quando ele já cobre as palavras */
      if (intro) {
        words = createIntroWords(box, family, box.clientWidth < 640);
        html.style.setProperty("--ik", String(ik));
      }
      ro.observe(box);
      io.observe(box);
      resize();
      /* a fonte display pode chegar depois: remede as letras */
      void document.fonts.ready.then(() => {
        if (!alive) return;
        fitLetters();
        measureWords();
        words?.setup();
      });
      const f = face();
      lx = tx = f.x;
      ly = ty = f.y;
      /* chegou tarde (a capa de segurança do CSS já mostrou o texto 2,5 s
       * depois do boot): não cobre de novo o que já apareceu. O relógio é o
       * do boot (data-intro-at), não o da navegação: numa 1ª visita fria o
       * próprio HTML pode chegar tarde, e a intro ainda tem os 2,5 s dela. */
      const bootAt = Number(html.dataset.introAt) || 0;
      if (intro && performance.now() - bootAt > 2300 && !("introForce" in html.dataset)) {
        html.dataset.introWhy = "late";
        finishIntro();
        skipped("late");
      }
      introStart = performance.now();
      ready = true;
      schedule();
      box.dataset.live = "";
      if (intro) {
        started = true;
        runMark = 1; // "run" só depois do 1º quadro da intro na tela (frame)
      } else if (html.dataset.intro === "pending" || html.dataset.intro === "run") html.dataset.intro = "done";
    })();

    return () => {
      alive = false;
      /* só encerra uma intro que começou: no dev o StrictMode monta, desmonta
       * e monta de novo, e marcar "done" aqui matava a intro antes do início */
      if (started) finishIntro(); // interrompida: mostra tudo, mas não conta como vista
      else {
        for (const ev of SKIP) removeEventListener(ev, skip);
        words?.destroy();
        words = null;
        intro = false;
        if (introOwner === token) introOwner = null; // a próxima montagem assume
      }
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
      delete box.dataset.enigma;
      /* desmontado de vez (bloco saiu de cena): libera o contexto já, sem esperar o GC */
      setTimeout(() => {
        if (!canvas.isConnected) gl.getExtension("WEBGL_lose_context")?.loseContext();
      }, 0);
    };
  }, [src, aspect, levels.black, levels.white, bg, onFail]);

  return <canvas ref={ref} aria-hidden="true" className="ascii-canvas font-mono" />;
}
