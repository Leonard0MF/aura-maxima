"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import AtmosphereTransition, {
  AtmosphereHandle,
  RGB,
} from "./AtmosphereTransition";
import StormIntro, { StormIntroHandle } from "./StormIntro";
import { display, mono } from "./fonts";

type Phase = "hero" | "traveling" | "storm" | "returning";

/*
 * ============================================================
 * UTILS
 * ============================================================
 */

const clamp = (v: number, a = 0, b = 1) => Math.min(Math.max(v, a), b);
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const smooth = (x: number) => x * x * (3 - 2 * x);

/*
 * ============================================================
 * TIMELINE (progresso 0..1)
 * ============================================================
 *
 * Regra: NADA de atmosfera antes de a Terra estar grande.
 *
 * 0.00 - 0.72   APROXIMAÇÃO: zoom hiperbólico (1/(1-k·t)).
 *               Lento no começo, explosivo no fim (~25x).
 *               Nunca para de crescer antes de a Terra sumir.
 * 0.52 - 0.74   zoom blur radial (só quando já há velocidade)
 * 0.56 - 0.68   halo azul nas bordas (~4x)
 * 0.62 - 0.92   folhas de nuvem (brancas -> azul de tempestade)
 * 0.64 - 0.80   véu: branco -> ardósia -> azul do storm
 * 0.64 - 0.74   Terra some (escondida pelo véu)
 * 0.76 - 0.82   storm liga por baixo do véu sólido
 * 0.82 - 1.00   DESCIDA: teto de nuvem sobe e sai, névoa sobe,
 *               storm (ampliado, só céu) inclina até o horizonte
 * 0.92          texto da Storm entra (tempo real)
 *
 * ============================================================
 */

const FORWARD_MS = 5000;
const RETURN_MS = 3400;
const REDUCED_MS = 500;
const COOLDOWN_MS = 700;

const GHOST_W = 1280; // resolução do canvas de zoom blur
const GHOST_SAMPLES = 8;

export default function Experience() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostRef = useRef<HTMLCanvasElement>(null);
  const earthRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const atmosphereRef = useRef<AtmosphereHandle>(null);
  const stormIntroRef = useRef<StormIntroHandle>(null);
  const stormSceneRef = useRef<HTMLDivElement>(null);
  const stormRef = useRef<HTMLVideoElement>(null);

  const [videoFinished, setVideoFinished] = useState(false);
  const finishedRef = useRef(false);

  const phaseRef = useRef<Phase>("hero");
  const animationRef = useRef<number | null>(null);
  const animationStartRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const cooldownRef = useRef(0);
  const stormTextRef = useRef(false);

  /*
   * ============================================================
   * SCROLL LOCK
   * ============================================================
   */

  const lockScroll = useCallback(() => {
    document.body.style.overflow = "hidden";
  }, []);

  const unlockScroll = useCallback(() => {
    document.body.style.overflow = "";
  }, []);

  const getDuration = (base: number) =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? REDUCED_MS
      : base;

  /*
   * ============================================================
   * HERO: REVELAÇÃO ROBUSTA
   * ============================================================
   *
   * O nome NÃO acompanha a timeline no retorno. Durante o retorno
   * ele fica oculto e, quando a Terra já está de volta, entra com
   * uma animação própria (WAAPI). Isso evita aparecer de repente
   * ou piscar por causa de valores intermediários da timeline.
   */

  const cancelHeroAnimations = useCallback(() => {
    identityRef.current?.getAnimations?.().forEach((a) => a.cancel());
    indicatorRef.current?.getAnimations?.().forEach((a) => a.cancel());
  }, []);

  const revealHero = useCallback(
    (delay = 0) => {
      const identity = identityRef.current;
      const indicator = indicatorRef.current;

      cancelHeroAnimations();

      if (identity) {
        identity.style.opacity = "1";
        identity.style.transform = "none";
        identity.style.filter = "none";

        identity.animate?.(
          [
            {
              opacity: 0,
              transform: "translate3d(0, 18px, 0)",
              filter: "blur(10px)",
            },
            {
              opacity: 1,
              transform: "translate3d(0, 0, 0)",
              filter: "blur(0px)",
            },
          ],
          {
            duration: 1000,
            delay,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "backwards",
          }
        );
      }

      if (indicator) {
        indicator.style.opacity = "1";

        indicator.animate?.([{ opacity: 0 }, { opacity: 1 }], {
          duration: 800,
          delay: delay + 500,
          easing: "ease",
          fill: "backwards",
        });
      }
    },
    [cancelHeroAnimations]
  );

  /*
   * ============================================================
   * ZOOM BLUR REAL
   * ============================================================
   *
   * Desenha o vídeo da Terra várias vezes em escalas crescentes
   * (a partir do ponto de fuga) e tira a média. É o que uma
   * câmera real registra quando se aproxima rápido.
   */

  const drawGhost = useCallback((spread: number, opacity: number) => {
    const ghost = ghostRef.current;
    if (!ghost) return;

    if (opacity < 0.01) {
      ghost.style.opacity = "0";
      return;
    }

    const video = videoRef.current;
    const still = canvasRef.current;
    const useStill = finishedRef.current;

    const src: HTMLVideoElement | HTMLCanvasElement | null = useStill
      ? still
      : video;

    const sw = useStill ? still?.width : video?.videoWidth;
    const sh = useStill ? still?.height : video?.videoHeight;

    if (!src || !sw || !sh) return;

    const cw = GHOST_W;
    const ch = Math.round((GHOST_W * window.innerHeight) / window.innerWidth);

    if (ghost.width !== cw || ghost.height !== ch) {
      ghost.width = cw;
      ghost.height = ch;
    }

    const ctx = ghost.getContext("2d");
    if (!ctx) return;

    /* object-cover */
    const cover = Math.max(cw / sw, ch / sh);
    const dw = sw * cover;
    const dh = sh * cover;
    const ox = (cw - dw) / 2;
    const oy = (ch - dh) / 2;

    /* mesmo ponto de fuga do transform-origin da Terra (50% 69%) */
    const fx = cw * 0.5;
    const fy = ch * 0.69;

    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, cw, ch);

    for (let i = 0; i < GHOST_SAMPLES; i++) {
      const s = 1 + spread * (i / (GHOST_SAMPLES - 1));

      ctx.globalAlpha = 1 / (i + 1); // média acumulada

      ctx.drawImage(
        src,
        fx + (ox - fx) * s,
        fy + (oy - fy) * s,
        dw * s,
        dh * s
      );
    }

    ctx.globalAlpha = 1;
    ghost.style.opacity = `${opacity}`;
  }, []);

  /*
   * ============================================================
   * RENDER DA TIMELINE
   * ============================================================
   */

  const renderProgress = useCallback(
    (progress: number) => {
      const earth = earthRef.current;
      const identity = identityRef.current;
      const indicator = indicatorRef.current;
      const stormScene = stormSceneRef.current;
      const storm = stormRef.current;

      /*
       * ------------------------------------------------------
       * EARTH: aproximação hiperbólica
       * ------------------------------------------------------
       */

      const z = seg(progress, 0, 0.72);

      const scale = 1 / (1 - 0.96 * z);

      const zt = Math.pow(z, 1.5);
      const tx = zt * 2;
      const ty = zt * -12;

      /* Tremor de turbulência (pequeno, só na travessia) */
      const shakeAmp =
        seg(progress, 0.64, 0.8) * (1 - seg(progress, 0.86, 0.95)) * 3;

      const sx =
        (Math.sin(progress * 83) + 0.5 * Math.sin(progress * 151)) * shakeAmp;
      const sy =
        (Math.cos(progress * 97) + 0.5 * Math.sin(progress * 173)) * shakeAmp;

      const blurAmount = seg(progress, 0.56, 0.72) * 5;
      const dim = seg(progress, 0.56, 0.72);

      if (earth) {
        earth.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate3d(${tx}%, ${ty}%, 0) scale(${scale})`;

        earth.style.filter =
          blurAmount > 0.05
            ? `blur(${blurAmount}px) brightness(${1 - dim * 0.05}) saturate(${
                1 - dim * 0.03
              })`
            : "none";

        const earthFade = smooth(seg(progress, 0.68, 0.80));

earth.style.opacity = `${1 - earthFade}`;
      }

      /* Zoom blur radial: só quando já existe velocidade */
      const spread = Math.pow(seg(progress, 0.52, 0.74), 1.4) * 0.6;
      const ghostOpacity = smooth(seg(progress, 0.52, 0.6));

      drawGhost(spread, ghostOpacity);

      /*
       * ------------------------------------------------------
       * IDENTITY + INDICATOR
       * ------------------------------------------------------
       * No retorno eles ficam fora da timeline (ver revealHero).
       */

      if (phaseRef.current !== "returning") {
        const identityProgress = smooth(seg(progress, 0, 0.14));

        if (identity) {
          identity.style.opacity = `${1 - identityProgress}`;
          identity.style.transform = `translate3d(${
            identityProgress * 95
          }px, ${identityProgress * -42}px, 0)`;
        }

        if (indicator) {
          indicator.style.opacity = `${1 - smooth(seg(progress, 0, 0.08))}`;
        }
      }

      /*
       * ------------------------------------------------------
       * ATMOSFERA (nuvens + véu)
       * ------------------------------------------------------
       */

      atmosphereRef.current?.render(progress);

      /*
       * ------------------------------------------------------
       * STORM
       * ------------------------------------------------------
       * Liga por baixo do véu sólido. Depois a câmera "inclina
       * para baixo": o vídeo começa ampliado (só o céu escuro),
       * com origem no TOPO; ao reduzir a escala, o horizonte
       * sobe da borda de baixo até a posição final.
       */

      const stormIn = smooth(seg(progress, 0.70, 0.80));

      const tiltLinear = seg(progress, 0.82, 1);
      const tilt = 1 - Math.pow(1 - tiltLinear, 3); // ease-out

      const stormScale = 1 + (1 - tilt) * 0.75;
      const stormBlur = (1 - tilt) * 6;

      if (stormScene) {
        stormScene.style.opacity = `${stormIn}`;
        stormScene.style.transform = `scale(${stormScale})`;
      }

      if (storm) {
        storm.style.filter = `${
          stormBlur > 0.1 ? `blur(${stormBlur}px) ` : ""
        }saturate(${0.82 + tilt * 0.18}) contrast(${
          0.97 + tilt * 0.1
        }) brightness(${0.88 + tilt * 0.12})`;
      }

      /*
       * ------------------------------------------------------
       * TEXTO DA STORM (só na ida; some no retorno)
       * ------------------------------------------------------
       */

      if (
        phaseRef.current === "traveling" &&
        progress >= 0.92 &&
        !stormTextRef.current
      ) {
        stormTextRef.current = true;
        stormIntroRef.current?.show();
      }
    },
    [drawGhost]
  );

  /*
   * ============================================================
   * CAPTURA DO FRAME FINAL DA TERRA
   * ============================================================
   */

  const captureFinalFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    finishedRef.current = true;
    setVideoFinished(true);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener("ended", captureFinalFrame);
    return () => video.removeEventListener("ended", captureFinalFrame);
  }, [captureFinalFrame]);

  /*
   * ============================================================
   * CORES DO STORM (amostradas do 1º frame)
   * ============================================================
   * O véu termina nessas cores (topo e base), então o
   * crossfade fica invisível.
   */

  useEffect(() => {
    const storm = stormRef.current;
    if (!storm) return;

    const sample = () => {
      if (storm.videoWidth === 0) return;

      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;

      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      try {
        ctx.drawImage(storm, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;

        const avg = (rowStart: number, rowEnd: number): RGB => {
          let r = 0;
          let g = 0;
          let b = 0;
          let n = 0;

          for (let row = rowStart; row < rowEnd; row++) {
            for (let col = 0; col < 8; col++) {
              const i = (row * 8 + col) * 4;
              r += d[i];
              g += d[i + 1];
              b += d[i + 2];
              n++;
            }
          }

          /* Compensa os overlays escuros da cena do storm. */
          const k = 0.88;

          return [(r / n) * k, (g / n) * k, (b / n) * k];
        };

        atmosphereRef.current?.setTint(avg(0, 3), avg(5, 8));
      } catch {
        // canvas bloqueado (vídeo de outro domínio): fica o fallback
      }
    };

    if (storm.readyState >= 2) sample();

    storm.addEventListener("loadeddata", sample);
    return () => storm.removeEventListener("loadeddata", sample);
  }, []);

  /*
   * ============================================================
   * RESET (Terra, atmosfera, storm; o hero é do revealHero)
   * ============================================================
   */

  const resetVisualState = useCallback(() => {
    const earth = earthRef.current;
    const ghost = ghostRef.current;
    const stormScene = stormSceneRef.current;
    const storm = stormRef.current;

    if (earth) {
      earth.style.opacity = "1";
      earth.style.transform = "translate3d(0,0,0) scale(1)";
      earth.style.filter = "none";
      earth.style.transformOrigin = "50% 69%";
    }

    if (ghost) {
      ghost.style.opacity = "0";
    }

    atmosphereRef.current?.render(0);

    stormTextRef.current = false;
    stormIntroRef.current?.hide();

    if (stormScene) {
      stormScene.style.opacity = "0";
      stormScene.style.transform = "scale(1.75)";
    }

    if (storm) {
      storm.pause();

      try {
        storm.currentTime = 0;
      } catch {
        // metadata ainda não disponível
      }

      storm.style.transform = "none";
      storm.style.filter = "none";
    }
  }, []);

  /*
   * ============================================================
   * FINISH FORWARD / RETURN
   * ============================================================
   */

  const finishForward = useCallback(() => {
    renderProgress(1);

    if (!stormTextRef.current) {
      stormTextRef.current = true;
      stormIntroRef.current?.show();
    }

    phaseRef.current = "storm";
    animationRef.current = null;

    unlockScroll();

    lastScrollYRef.current = window.scrollY;
    cooldownRef.current = performance.now() + COOLDOWN_MS;
  }, [renderProgress, unlockScroll]);

  const finishReturn = useCallback(() => {
    renderProgress(0);
    resetVisualState();

    phaseRef.current = "hero";
    animationRef.current = null;

    unlockScroll();

    window.scrollTo({ top: 0, behavior: "instant" });
    lastScrollYRef.current = 0;

    /* Evita que o scroll com inércia dispare a ida de novo. */
    cooldownRef.current = performance.now() + COOLDOWN_MS;

    revealHero(150);
  }, [renderProgress, resetVisualState, revealHero, unlockScroll]);

  /*
   * ============================================================
   * FORWARD
   * ============================================================
   */

  const startForward = useCallback(() => {
    if (phaseRef.current !== "hero") return;

    phaseRef.current = "traveling";
    animationStartRef.current = performance.now();

    lockScroll();
    cancelHeroAnimations();

    /* O storm toca já, invisível, para não engasgar no crossfade. */
    stormRef.current?.play().catch(() => {});

    const duration = getDuration(FORWARD_MS);

    const animate = (now: number) => {
      if (phaseRef.current !== "traveling") return;

      const progress = clamp((now - animationStartRef.current) / duration);

      renderProgress(progress);

      if (progress >= 1) {
        finishForward();
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [cancelHeroAnimations, finishForward, lockScroll, renderProgress]);

  /*
   * ============================================================
   * RETURN (mesma timeline, invertida)
   * ============================================================
   */

  const startReturn = useCallback(() => {
    if (phaseRef.current !== "storm") return;

    phaseRef.current = "returning";
    animationStartRef.current = performance.now();

    lockScroll();

    /* O texto da Storm some rápido antes de a viagem de volta. */
    stormTextRef.current = false;
    stormIntroRef.current?.hide();

    const duration = getDuration(RETURN_MS);

    const animate = (now: number) => {
      if (phaseRef.current !== "returning") return;

      const reverse = clamp((now - animationStartRef.current) / duration);

      renderProgress(1 - reverse);

      if (reverse >= 1) {
        finishReturn();
        return;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [finishReturn, lockScroll, renderProgress]);

  /*
   * ============================================================
   * SCROLL (só dispara; durante a animação fica travado)
   * ============================================================
   */

  useEffect(() => {
    let ticking = false;

    const update = () => {
      ticking = false;

      const currentY = window.scrollY;
      const delta = currentY - lastScrollYRef.current;

      lastScrollYRef.current = currentY;

      const phase = phaseRef.current;

      if (phase === "traveling" || phase === "returning") return;

      /* Cooldown: ignora a inércia do scroll logo após uma transição. */
      if (performance.now() < cooldownRef.current) return;

      /* STORM -> HERO (só perto do topo) */
      if (
        phase === "storm" &&
        delta < -2 &&
        currentY < window.innerHeight * 0.5
      ) {
        startReturn();
        return;
      }

      /* HERO -> STORM */
      if (
        phase === "hero" &&
        delta > 0 &&
        currentY > window.innerHeight * 0.04
      ) {
        startForward();
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    lastScrollYRef.current = window.scrollY;

    return () => {
      window.removeEventListener("scroll", onScroll);

      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
      }

      document.body.style.overflow = "";
    };
  }, [startForward, startReturn]);

  /*
   * ============================================================
   * INTRO
   * ============================================================
   * A transition de opacity da Terra é removida depois do fade-in,
   * senão ela atrasaria a opacidade durante a viagem.
   */

  useEffect(() => {
    const earth = earthRef.current;
    if (!earth) return;

    if (window.scrollY > 10) {
      earth.style.opacity = "1";

      if (identityRef.current) identityRef.current.style.opacity = "1";
      if (indicatorRef.current) indicatorRef.current.style.opacity = "1";

      return;
    }

    earth.style.opacity = "0";
    earth.style.transition = "none";

    const start = window.setTimeout(() => {
      earth.style.transition =
        "opacity 1100ms cubic-bezier(0.22, 1, 0.36, 1)";
      earth.style.opacity = "1";
    }, 100);

    const cleanup = window.setTimeout(() => {
      earth.style.transition = "none";
    }, 1300);

    const hero = window.setTimeout(() => revealHero(0), 450);

    return () => {
      window.clearTimeout(start);
      window.clearTimeout(cleanup);
      window.clearTimeout(hero);
    };
  }, [revealHero]);

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <main className="relative min-h-screen bg-black">
      <section className="relative h-[300vh] w-full bg-black">
        {/* =====================================================
            EARTH (z-10)
        ====================================================== */}

        <div
          ref={earthRef}
          className="fixed inset-0 z-10 h-screen w-full overflow-hidden will-change-transform"
          style={{ opacity: 0, transformOrigin: "50% 69%" }}
        >
          <video
            ref={videoRef}
            src="/videos/earth.mp4"
            autoPlay
            muted
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: videoFinished ? 0 : 1,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          />

          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: videoFinished ? 1 : 0,
              transition: "opacity 500ms ease",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            }}
          />

          {/* Zoom blur radial (média de cópias em escalas crescentes) */}
          <canvas
            ref={ghostRef}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ opacity: 0 }}
          />

          {/* Vignette */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, transparent 24%, rgba(0,0,0,0.14) 60%, rgba(0,0,0,0.78) 100%)",
            }}
          />

          {/* Bottom darkness */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, transparent 42%, rgba(0,0,0,0.28) 100%)",
            }}
          />
        </div>

        {/* =====================================================
            STORM (z-20, ABAIXO da atmosfera)
        ====================================================== */}

        <div
          ref={stormSceneRef}
          className="pointer-events-none fixed inset-0 z-20 overflow-hidden will-change-[opacity,transform]"
          style={{
            opacity: 0,
            transform: "scale(1.75)",
            transformOrigin: "50% 0%",
            background: "#183441",
          }}
        >
          <video
            ref={stormRef}
            src="/videos/storm.mp4"
            muted
            playsInline
            preload="auto"
            loop
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              willChange: "transform",
            }}
          />

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to bottom, rgba(18,42,54,0.02), rgba(3,13,20,0.42))",
            }}
          />

          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, transparent 35%, rgba(2,8,12,0.28) 72%, rgba(1,5,8,0.68) 100%)",
            }}
          />
        </div>

        {/* =====================================================
            ATMOSPHERE (z-[45], ACIMA do storm)
        ====================================================== */}

        <AtmosphereTransition ref={atmosphereRef} />

        {/* =====================================================
            STORM INTRO (z-[48])
        ====================================================== */}

        <StormIntro ref={stormIntroRef} />

        {/* =====================================================
            IDENTITY (z-50)
        ====================================================== */}

        <div
          ref={identityRef}
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-end px-6 md:px-[7vw]"
          style={{ opacity: 0 }}
        >
          <div className="w-full text-white md:w-[44vw] md:max-w-[760px]">
            <p
              className={`${mono.className} mb-3 text-[9px] uppercase tracking-[0.3em] text-white/50 sm:text-[10px] md:mb-5 md:text-xs md:tracking-[0.45em]`}
            >
              Developer · Builder · Security-minded Engineer
            </p>

            <h1
              className={`${display.className} text-[clamp(2.8rem,9vw,6rem)] font-bold leading-[0.92] tracking-[-0.03em] md:text-[clamp(3.4rem,5.6vw,6rem)]`}
            >
              Leonardo
              <br />
              Machmann
            </h1>
          </div>
        </div>

        {/* =====================================================
            SCROLL INDICATOR (z-50)
        ====================================================== */}

        <div
          ref={indicatorRef}
          className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 text-center"
          style={{ opacity: 0 }}
        >
          <p
            className={`${mono.className} text-[8px] uppercase tracking-[0.35em] text-white/40 md:text-[10px]`}
          >
            Scroll to enter
          </p>

          <div className="mx-auto mt-3 h-7 w-px bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      </section>
    </main>
  );
}