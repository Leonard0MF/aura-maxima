"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

/*
 * ============================================================
 * API
 * ============================================================
 *
 * render(progress)        -> desenha a atmosfera (0..1)
 * setTint(top, bottom)    -> cores do topo e da base do 1º
 *                            frame do storm
 *
 * Tudo é desenhado em UM canvas de resolução reduzida.
 *
 * Camadas (de baixo para cima):
 *   1. halo azul nas bordas (atmosfera se adensando)
 *   2. véu de nuvem: branco -> ardósia -> azul de tempestade
 *      + varredura: o "teto" sobe e sai da tela (saída da nuvem)
 *   3. folhas de nuvem, cada uma MAIS AZUL e ESCURA que a anterior,
 *      para conversar com o vídeo do storm
 *   4. fiapos de névoa azulada subindo (sensação de DESCER)
 *
 * Tudo só começa depois de a Terra estar grande (progress ~0.56+).
 *
 * z-index 45: ACIMA do storm (z-20), ABAIXO da identity (z-50).
 * ============================================================
 */

export type RGB = [number, number, number];

export type AtmosphereHandle = {
  render: (progress: number) => void;
  setTint: (top: RGB, bottom: RGB) => void;
};

const RES = 0.5;

const clamp = (v: number, a = 0, b = 1) => Math.min(Math.max(v, a), b);
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

const css = (c: RGB) =>
  `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

/* Véu: branco de topo de nuvem -> ardósia fria -> cor do storm. */
const WHITE: RGB = [238, 242, 246];
const SLATE: RGB = [104, 124, 148];

/* Quanto do azul do storm o véu herda no final. */
const TINT_WEIGHT = 0.85;

/*
 * Folhas de nuvem. A paleta escurece e azula a cada folha:
 * a primeira é topo de nuvem (branco), a última já é a
 * tempestade (azul profundo com brilho azulado, como no vídeo).
 */
const SHEETS: {
  seed: number;
  start: number;
  len: number;
  gain: number;
  peak: number;
  dx: number;
  dy: number;
  dark: RGB;
  light: RGB;
}[] = [
  {
    seed: 11, start: 0.62, len: 0.18, gain: 4, peak: 0.5, dx: -5, dy: 3,
    dark: [148, 164, 184], light: [244, 248, 252],
  },
  {
    seed: 23, start: 0.66, len: 0.18, gain: 6, peak: 0.6, dx: 7, dy: -4,
    dark: [104, 124, 150], light: [206, 220, 236],
  },
  {
    seed: 37, start: 0.7, len: 0.18, gain: 8, peak: 0.7, dx: -9, dy: -3,
    dark: [58, 82, 114], light: [138, 166, 198],
  },
  {
    seed: 51, start: 0.74, len: 0.18, gain: 11, peak: 0.8, dx: 5, dy: 5,
    dark: [28, 46, 76], light: [78, 112, 152],
  },
];

/* Fiapos de névoa azulada que sobem na saída da nuvem. */
const WISPS = [
  { seed: 71, start: 0.84, dx: -0.12 },
  { seed: 89, start: 0.9, dx: 0.14 },
];

const WISP_DARK: RGB = [34, 56, 88];
const WISP_LIGHT: RGB = [104, 138, 178];

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type TexOpts = {
  hole: boolean; // buraco central (folhas de nuvem)
  dark: RGB;
  light: RGB;
};

/*
 * Textura de nuvem procedural (ruído fbm).
 * Buraco central e bordas suaves já vêm assados no alpha.
 */
function makeCloudTexture(seed: number, size: number, opts: TexOpts) {
  const rnd = mulberry32(seed);
  const G = 32;
  const lattice = Float32Array.from({ length: G * G }, () => rnd());
  const at = (x: number, y: number) =>
    lattice[(((y % G) + G) % G) * G + (((x % G) + G) % G)];

  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  const fbm = (x: number, y: number) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < 5; i++) {
      sum += noise(x * f, y * f) * amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / 0.96875;
  };

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const n = fbm(nx * 4, ny * 4);

      const r = Math.hypot(nx - 0.5, ny - 0.5) * 2;

      const hole = opts.hole ? smooth(seg(r, 0.2, 0.65)) : 1;
      const edge = opts.hole
        ? 1 - smooth(seg(r, 0.8, 1.0))
        : 1 - smooth(seg(r, 0.62, 0.98));

      const alpha = smooth(clamp((n - 0.4) / 0.38)) * hole * edge;
      const m = clamp(n * 1.35 - 0.12);

      const i = (y * size + x) * 4;
      img.data[i] = lerp(opts.dark[0], opts.light[0], m);
      img.data[i + 1] = lerp(opts.dark[1], opts.light[1], m);
      img.data[i + 2] = lerp(opts.dark[2], opts.light[2], m);
      img.data[i + 3] = alpha * 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

const AtmosphereTransition = forwardRef<AtmosphereHandle>(
  function AtmosphereTransition(_props, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const texturesRef = useRef<HTMLCanvasElement[]>([]);
    const lastProgressRef = useRef(0);

    /* Fallback; substituído pela cor amostrada do storm. */
    const tintRef = useRef<{ top: RGB; bottom: RGB }>({
      top: [24, 42, 82],
      bottom: [8, 16, 26],
    });

    const draw = (p: number) => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;

      if (!canvas || !ctx) return;

      lastProgressRef.current = p;

      /* Nada acontece antes de a Terra estar grande. */
      if (p <= 0.5) {
        canvas.style.visibility = "hidden";
        return;
      }

      canvas.style.visibility = "visible";

      const W = canvas.width;
      const H = canvas.height;

      /* Tremor de turbulência (aplicado ao canvas todo). */
      const shake = seg(p, 0.64, 0.84) * (1 - seg(p, 0.9, 0.97)) * 4;

      if (shake > 0.01) {
        const sx = (Math.sin(p * 83) + 0.5 * Math.sin(p * 151)) * shake;
        const sy = (Math.cos(p * 97) + 0.5 * Math.sin(p * 173)) * shake;

        canvas.style.transform = `translate3d(${sx}px, ${sy}px, 0) scale(1.03)`;
      } else {
        canvas.style.transform = "none";
      }

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);

      // O ponto de fuga sobe de 69% (foco da Terra) até ~55%.
      const focalY = lerp(0.69, 0.55, smooth(seg(p, 0.4, 0.8)));

      /*
       * 1. HALO DE ATMOSFERA
       * Azul nas bordas: a atmosfera se adensando.
       */
      const hazeOp =
        smooth(seg(p, 0.56, 0.68)) * (1 - smooth(seg(p, 0.74, 0.86)));

      if (hazeOp > 0.003) {
        const R = Math.hypot(W, H) / 2;

        const g = ctx.createRadialGradient(
          W / 2,
          H * focalY,
          R * 0.35,
          W / 2,
          H * focalY,
          R
        );

        g.addColorStop(0, "rgba(110,160,215,0)");
        g.addColorStop(1, "rgba(110,160,215,0.30)");

        ctx.globalAlpha = hazeOp;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      /*
       * 2. VÉU DE NUVEM
       * Branco -> ardósia -> azul de tempestade.
       */
      const veilOp =
        smooth(seg(p, 0.64, 0.72)) * 0.5 + smooth(seg(p, 0.72, 0.8)) * 0.5;

      if (veilOp > 0.002) {
        const v = seg(p, 0.64, 0.84);
        const base = v < 0.35 ? mix(WHITE, SLATE, v / 0.35) : SLATE;
        const k = smooth(seg(v, 0.35, 1)) * TINT_WEIGHT;

        const top = mix(base, tintRef.current.top, k);
        const bottom = mix(base, tintRef.current.bottom, k);

        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, css(top));
        g.addColorStop(1, css(bottom));

        ctx.globalAlpha = veilOp;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        /*
         * SAÍDA DA NUVEM
         * O teto sobe e sai da tela: o mar é revelado primeiro,
         * depois o horizonte, por último o céu.
         */
        const r = smooth(seg(p, 0.82, 1.0));

        if (r > 0.001) {
          const soft = H * 0.3;
          const yb = lerp(H + soft, -soft, r);

          const erase = ctx.createLinearGradient(0, yb - soft, 0, yb + soft);
          erase.addColorStop(0, "rgba(0,0,0,0)");
          erase.addColorStop(1, "rgba(0,0,0,1)");

          ctx.globalCompositeOperation = "destination-out";
          ctx.globalAlpha = 1;
          ctx.fillStyle = erase;
          ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = "source-over";
        }
      }

      /*
       * 3. FOLHAS DE NUVEM
       * Desenhadas por cima do véu: ele nunca fica chapado.
       */
      const textures = texturesRef.current;
      const cloudFade = 1 - smooth(seg(p, 0.8, 0.92));

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      SHEETS.forEach((s, i) => {
        const tex = textures[i];
        if (!tex) return;

        const t = seg(p, s.start, s.start + s.len);

        const op =
          smooth(seg(t, 0, 0.25)) *
          (1 - smooth(seg(t, 0.7, 1))) *
          s.peak *
          cloudFade;

        if (op < 0.003) return;

        const scale = 1 + s.gain * Math.pow(t, 1.8);
        const size = Math.max(W, H) * 1.5 * scale;

        const cx = W * (0.5 + (s.dx * t) / 100);
        const cy = H * (focalY + (s.dy * t) / 100);

        ctx.globalAlpha = op;
        ctx.drawImage(tex, cx - size / 2, cy - size / 2, size, size);
      });

      /*
       * 4. FIAPOS DE NÉVOA SUBINDO
       * Na saída da nuvem, tudo passa subindo pela tela:
       * é isso que dá a sensação de estar DESCENDO.
       */
      WISPS.forEach((w, j) => {
        const tex = textures[SHEETS.length + j];
        if (!tex) return;

        const e = seg(p, w.start, 1.0);
        const a = Math.sin(Math.PI * e) * 0.34;

        if (a < 0.004) return;

        const ww = W * 1.6;
        const hh = H * 2.4;

        const cx = W * (0.5 + w.dx);
        const cy = lerp(H * 1.2, -H * 0.5, e);

        ctx.globalAlpha = a;
        ctx.drawImage(tex, cx - ww / 2, cy - hh / 2, ww, hh);
      });

      ctx.globalAlpha = 1;
    };

    /* Tamanho do canvas */
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      ctxRef.current = canvas.getContext("2d");

      const resize = () => {
        canvas.width = Math.max(2, Math.round(window.innerWidth * RES));
        canvas.height = Math.max(2, Math.round(window.innerHeight * RES));
        draw(lastProgressRef.current);
      };

      resize();
      window.addEventListener("resize", resize);

      return () => window.removeEventListener("resize", resize);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Texturas: geradas quando o navegador estiver ocioso */
    useEffect(() => {
      const build = () => {
        const sheets = SHEETS.map((s) =>
          makeCloudTexture(s.seed, 384, {
            hole: true,
            dark: s.dark,
            light: s.light,
          })
        );

        const wisps = WISPS.map((w) =>
          makeCloudTexture(w.seed, 256, {
            hole: false,
            dark: WISP_DARK,
            light: WISP_LIGHT,
          })
        );

        texturesRef.current = [...sheets, ...wisps];
        draw(lastProgressRef.current);
      };

      const w = window as unknown as {
        requestIdleCallback?: (cb: () => void) => number;
        cancelIdleCallback?: (id: number) => void;
      };

      let idleId: number | null = null;
      let timeoutId: number | null = null;

      if (w.requestIdleCallback) {
        idleId = w.requestIdleCallback(build);
      } else {
        timeoutId = window.setTimeout(build, 200);
      }

      return () => {
        if (idleId !== null && w.cancelIdleCallback) {
          w.cancelIdleCallback(idleId);
        }
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      render: draw,
      setTint: (top, bottom) => {
        tintRef.current = { top, bottom };
      },
    }));

    return (
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-[45] h-full w-full"
        style={{ visibility: "hidden" }}
      />
    );
  }
);

AtmosphereTransition.displayName = "AtmosphereTransition";

export default AtmosphereTransition;