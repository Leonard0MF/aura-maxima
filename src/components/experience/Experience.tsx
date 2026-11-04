"use client";

import dynamic from "next/dynamic";
import {
  Component,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import AtmosphereTransition, {
  AtmosphereHandle,
  RGB,
} from "./AtmosphereTransition";
import StormIntro, { StormIntroHandle } from "./StormIntro";
import { display, mono } from "./fonts";
import { clamp, FLIGHT_END, seg, smooth, travel } from "./travel";

/* three.js só no cliente e em um chunk separado. */
const SpaceScene = dynamic(() => import("./SpaceScene"), { ssr: false });

type Phase = "hero" | "traveling" | "storm" | "returning";

/*
 * ============================================================
 * WEBGL OU VÍDEO
 * ============================================================
 * Sem aceleração de hardware (GPU bloqueada, driver ruim,
 * "aceleração de hardware" desligada no navegador) não existe
 * WebGL. Nesses casos a Terra volta a ser o vídeo com zoom,
 * em vez de deixar a página preta.
 */

let webglCache: boolean | null = null;

function detectWebGL() {
  if (webglCache !== null) return webglCache;

  /* Dev: /?fallback=1 força o modo vídeo para testar. */
  if (
    process.env.NODE_ENV !== "production" &&
    new URLSearchParams(window.location.search).has("fallback")
  ) {
    return (webglCache = false);
  }

  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    webglCache = !!gl;
    (gl as WebGLRenderingContext | null)
      ?.getExtension("WEBGL_lose_context")
      ?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

const noopSubscribe = () => () => {};

/* Se a cena 3D quebrar ao renderizar, cai para o vídeo. */
class SceneBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/* Tempo máximo esperando a cena antes de mostrar o hero assim mesmo. */
const SCENE_TIMEOUT_MS = 8000;

/* A timeline está documentada em travel.ts. */

const FORWARD_MS = 6200;
const RETURN_MS = 3800;
const REDUCED_MS = 500;
const COOLDOWN_MS = 700;

/* Depois que o hero aparece, começa a baixar o vídeo do storm. */
const STORM_PRELOAD_DELAY_MS = 1200;

/*
 * VÍDEO DE VOO (modo realista)
 * Se este arquivo existir, a viagem do espaço até as nuvens é
 * esse vídeo, e não a cena 3D. Ele toca em tempo real na ida e
 * é "rebobinado" quadro a quadro na volta.
 */
const FLIGHT_SRC = "/videos/flight.mp4";

/* Depois do voo: nuvens -> storm, em tempo real. */
const FLIGHT_TAIL_MS = 1800;

/* Se o vídeo travar (rede) por mais que isso, segue sem ele. */
const FLIGHT_STALL_MS = 1500;

/*
 * flight: vídeo de voo real (preferido)
 * 3d:     cena three.js (sem vídeo de voo)
 * zoom:   vídeo da Terra com zoom (sem WebGL)
 */
type Mode = "flight" | "3d" | "zoom";

export default function Experience() {
  const spaceRef = useRef<HTMLDivElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const atmosphereRef = useRef<AtmosphereHandle>(null);
  const stormIntroRef = useRef<StormIntroHandle>(null);
  const stormSceneRef = useRef<HTMLDivElement>(null);
  const stormRef = useRef<HTMLVideoElement>(null);

  /* A cena 3D para de renderizar quando está escondida pelo storm. */
  const [sceneActive, setSceneActive] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);

  /* null no servidor; no cliente, true/false conforme o suporte a WebGL. */
  const webglSupported = useSyncExternalStore(noopSubscribe, detectWebGL, () => null);
  const [sceneFailed, setSceneFailed] = useState(false);
  const fallbackVideoRef = useRef<HTMLVideoElement>(null);
  const flightRef = useRef<HTMLVideoElement>(null);

  /* null enquanto verifica se o vídeo de voo existe. */
  const [flightAvailable, setFlightAvailable] = useState<boolean | null>(null);

  const mode: Mode | null =
    flightAvailable === null || webglSupported === null
      ? null
      : flightAvailable
        ? "flight"
        : webglSupported && !sceneFailed
          ? "3d"
          : "zoom";

  const modeRef = useRef<Mode | null>(null);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(FLIGHT_SRC, { method: "HEAD", signal: ctrl.signal })
      .then((r) => setFlightAvailable(r.ok))
      .catch(() => {
        if (!ctrl.signal.aborted) setFlightAvailable(false);
      });
    return () => ctrl.abort();
  }, []);

  const phaseRef = useRef<Phase>("hero");
  const animationRef = useRef<number | null>(null);
  const animationStartRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const cooldownRef = useRef(0);
  const stormTextRef = useRef(false);

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
   * HERO: revelação própria (WAAPI), fora da timeline no retorno
   * ============================================================
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

        identity.animate?.(
          [
            { opacity: 0, transform: "translate3d(0, 24px, 0)", filter: "blur(12px)" },
            { opacity: 1, transform: "translate3d(0, 0, 0)", filter: "blur(0px)" },
          ],
          {
            duration: 1300,
            delay,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "backwards",
          }
        );
      }

      if (indicator) {
        indicator.style.opacity = "1";
        indicator.animate?.([{ opacity: 0 }, { opacity: 1 }], {
          duration: 900,
          delay: delay + 700,
          easing: "ease",
          fill: "backwards",
        });
      }
    },
    [cancelHeroAnimations]
  );

  /*
   * ============================================================
   * RENDER DA TIMELINE (lado DOM; a cena 3D lê travel.progress)
   * ============================================================
   */

  const renderProgress = useCallback((progress: number) => {
    travel.progress = progress;

    const space = spaceRef.current;
    const identity = identityRef.current;
    const indicator = indicatorRef.current;
    const stormScene = stormSceneRef.current;
    const storm = stormRef.current;

    /* Modo realista: hero -> vídeo de voo, que segue o progresso. */
    const flight = flightRef.current;
    if (modeRef.current === "flight" && flight) {
      flight.style.opacity = `${smooth(seg(progress, 0, 0.025))}`;

      /* Na volta (e no modo de inspeção) o vídeo é posicionado pelo progresso. */
      if (phaseRef.current !== "traveling" && flight.duration && !flight.seeking) {
        const t = seg(progress, 0, FLIGHT_END) * flight.duration;
        if (Math.abs(flight.currentTime - t) > 0.03) flight.currentTime = t;
      }
    }

    /* Fallback em vídeo: zoom hiperbólico (o comportamento antigo). */
    const fallback = fallbackVideoRef.current;
    if (modeRef.current === "zoom" && fallback) {
      const z = seg(progress, 0, 0.72);
      const blur = seg(progress, 0.56, 0.72) * 5;
      fallback.style.transform = `translate3d(${z ** 1.5 * 2}%, ${
        z ** 1.5 * -12
      }%, 0) scale(${1 / (1 - 0.96 * z)})`;
      fallback.style.filter = blur > 0.05 ? `blur(${blur}px)` : "none";
    }

    /* O espaço some por baixo do véu de nuvem. */
    if (space) {
      space.style.opacity = `${1 - smooth(seg(progress, 0.72, 0.8))}`;
    }

    if (phaseRef.current !== "returning") {
      const out = smooth(seg(progress, 0, 0.12));

      if (identity) {
        identity.style.opacity = `${1 - out}`;
        identity.style.transform = `translate3d(${out * 60}px, 0, 0)`;
      }
      if (indicator) {
        indicator.style.opacity = `${1 - smooth(seg(progress, 0, 0.06))}`;
      }
    }

    atmosphereRef.current?.render(progress);

    /* STORM: liga por baixo do véu e "inclina" até o horizonte. */
    const stormIn = smooth(seg(progress, 0.7, 0.8));
    const tilt = 1 - Math.pow(1 - seg(progress, 0.82, 1), 3);
    const stormBlur = (1 - tilt) * 6;

    if (stormScene) {
      stormScene.style.opacity = `${stormIn}`;
      stormScene.style.visibility = stormIn > 0 ? "visible" : "hidden";
      stormScene.style.transform = `scale(${1 + (1 - tilt) * 0.75})`;
    }

    if (storm) {
      storm.style.filter = `${stormBlur > 0.1 ? `blur(${stormBlur}px) ` : ""}saturate(${
        0.82 + tilt * 0.18
      }) contrast(${0.97 + tilt * 0.1}) brightness(${0.88 + tilt * 0.12})`;
    }

    if (phaseRef.current === "traveling" && progress >= 0.92 && !stormTextRef.current) {
      stormTextRef.current = true;
      stormIntroRef.current?.show();
    }
  }, []);

  /*
   * ============================================================
   * CORES DO STORM (amostradas do 1º frame) -> véu termina nelas
   * ============================================================
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
          let r = 0, g = 0, b = 0, n = 0;
          for (let row = rowStart; row < rowEnd; row++) {
            for (let col = 0; col < 8; col++) {
              const i = (row * 8 + col) * 4;
              r += d[i];
              g += d[i + 1];
              b += d[i + 2];
              n++;
            }
          }
          const k = 0.88; // compensa os overlays escuros
          return [(r / n) * k, (g / n) * k, (b / n) * k];
        };

        atmosphereRef.current?.setTint(avg(0, 3), avg(5, 8));
      } catch {
        // canvas bloqueado: fica o fallback
      }
    };

    if (storm.readyState >= 2) sample();
    storm.addEventListener("loadeddata", sample);
    return () => storm.removeEventListener("loadeddata", sample);
  }, []);

  /* O vídeo do storm (pesado) só começa a baixar depois do hero. */
  const preloadStorm = useCallback(() => {
    const storm = stormRef.current;
    if (!storm || storm.preload === "auto") return;
    storm.preload = "auto";
    storm.load();
  }, []);

  /*
   * ============================================================
   * RESET / FINISH
   * ============================================================
   */

  const resetVisualState = useCallback(() => {
    const stormScene = stormSceneRef.current;
    const storm = stormRef.current;

    atmosphereRef.current?.render(0);

    stormTextRef.current = false;
    stormIntroRef.current?.hide();

    if (stormScene) {
      stormScene.style.opacity = "0";
      stormScene.style.visibility = "hidden";
    }

    if (storm) {
      storm.pause();
      try {
        storm.currentTime = 0;
      } catch {
        // metadata ainda não disponível
      }
    }
  }, []);

  const finishForward = useCallback(() => {
    renderProgress(1);

    if (!stormTextRef.current) {
      stormTextRef.current = true;
      stormIntroRef.current?.show();
    }

    phaseRef.current = "storm";
    animationRef.current = null;
    setSceneActive(false);

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
    cooldownRef.current = performance.now() + COOLDOWN_MS;

    revealHero(150);
  }, [renderProgress, resetVisualState, revealHero, unlockScroll]);

  /*
   * ============================================================
   * FORWARD / RETURN
   * ============================================================
   */

  const run = useCallback(
    (phase: "traveling" | "returning", duration: number, onDone: () => void) => {
      phaseRef.current = phase;
      animationStartRef.current = performance.now();

      const animate = (now: number) => {
        if (phaseRef.current !== phase) return;

        const t = clamp((now - animationStartRef.current) / duration);
        renderProgress(phase === "traveling" ? t : 1 - t);

        if (t >= 1) {
          onDone();
          return;
        }
        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);
    },
    [renderProgress]
  );

  /*
   * Ida no modo realista: quem dita o progresso é o próprio
   * vídeo (currentTime). Quando ele acaba, a cauda (nuvens ->
   * storm) segue em tempo real.
   */
  const runFlight = useCallback(
    (flight: HTMLVideoElement) => {
      phaseRef.current = "traveling";

      flight.pause();
      flight.currentTime = 0;
      flight.play().catch(() => {});

      let tailStart: number | null = null;
      let tailFrom = 0;
      let lastTime = -1;
      let lastChange = performance.now();

      const animate = (now: number) => {
        if (phaseRef.current !== "traveling") return;

        let p = 0;

        if (tailStart === null) {
          const d = flight.duration || 1;
          p = clamp(flight.currentTime / d) * FLIGHT_END;

          if (flight.currentTime !== lastTime) {
            lastTime = flight.currentTime;
            lastChange = now;
          }

          const stalled = now - lastChange > FLIGHT_STALL_MS;
          if (flight.ended || flight.currentTime >= d - 0.05 || stalled) {
            tailStart = now;
            tailFrom = p;
          }
        }

        if (tailStart !== null) {
          const k = clamp((now - tailStart) / FLIGHT_TAIL_MS);
          p = tailFrom + (1 - tailFrom) * k;
        }

        renderProgress(p);

        if (p >= 1) {
          flight.pause();
          finishForward();
          return;
        }
        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);
    },
    [finishForward, renderProgress]
  );

  const startForward = useCallback(() => {
    if (phaseRef.current !== "hero") return;

    lockScroll();
    cancelHeroAnimations();
    preloadStorm();

    /* Toca já, invisível, para não engasgar no crossfade. */
    stormRef.current?.play().catch(() => {});

    const flight = flightRef.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (modeRef.current === "flight" && flight && !reduced) {
      runFlight(flight);
      return;
    }

    run("traveling", getDuration(FORWARD_MS), finishForward);
  }, [cancelHeroAnimations, finishForward, lockScroll, preloadStorm, run, runFlight]);

  const startReturn = useCallback(() => {
    if (phaseRef.current !== "storm") return;

    lockScroll();
    setSceneActive(true);

    stormTextRef.current = false;
    stormIntroRef.current?.hide();

    flightRef.current?.pause();
    run("returning", getDuration(RETURN_MS), finishReturn);
  }, [finishReturn, lockScroll, run]);

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
      if (performance.now() < cooldownRef.current) return;

      if (phase === "storm" && delta < -2 && currentY < window.innerHeight * 0.5) {
        startReturn();
        return;
      }

      if (phase === "hero" && delta > 0 && currentY > window.innerHeight * 0.04) {
        startForward();
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    const onPointer = (e: PointerEvent) => {
      travel.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
      travel.pointerY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    lastScrollYRef.current = window.scrollY;

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      document.body.style.overflow = "";
    };
  }, [startForward, startReturn]);

  /*
   * ============================================================
   * INTRO: quando as texturas carregam, o espaço acende
   * ============================================================
   */

  const onSceneReady = useCallback(() => setSceneReady(true), []);
  const onSceneError = useCallback(() => setSceneFailed(true), []);

  /* O three.js às vezes falha ao criar o contexto de forma assíncrona. */
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = String((e.reason as Error | undefined)?.message ?? e.reason);
      if (msg.includes("WebGL")) {
        e.preventDefault();
        setSceneFailed(true);
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  /* Rede: se a cena demorar demais, o hero aparece mesmo assim. */
  useEffect(() => {
    if (sceneReady) return;
    const id = window.setTimeout(() => setSceneReady(true), SCENE_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [sceneReady]);

  useEffect(() => {
    if (!sceneReady) return;

    const space = spaceRef.current;

    /* Modo de inspeção (só em dev): /?p=0.6 congela a timeline. */
    if (process.env.NODE_ENV !== "production") {
      const p = new URLSearchParams(window.location.search).get("p");
      if (p !== null) {
        if (space) space.style.opacity = "1";
        renderProgress(Number(p));
        if (Number(p) === 0) revealHero(0);
        return;
      }
    }

    if (space) {
      space.animate?.([{ opacity: 0 }, { opacity: 1 }], {
        duration: 1800,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "backwards",
      });
      space.style.opacity = "1";
    }

    const hero = window.setTimeout(() => revealHero(0), 500);

    /* O vídeo de voo precisa estar pronto no primeiro scroll. */
    const flight = flightRef.current;
    if (flight && flight.preload !== "auto") {
      flight.preload = "auto";
      flight.load();
    }
    const storm = window.setTimeout(preloadStorm, STORM_PRELOAD_DELAY_MS);

    return () => {
      window.clearTimeout(hero);
      window.clearTimeout(storm);
    };
  }, [sceneReady, preloadStorm, renderProgress, revealHero]);

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */

  return (
    <div className="relative min-h-screen bg-black">
      <section className="relative h-[300vh] w-full bg-black">
        {/* ESPAÇO 3D (z-10) */}
        <div
          ref={spaceRef}
          className="fixed inset-0 z-10 h-screen w-full"
          style={{ opacity: 0 }}
        >
          {mode === "3d" && (
            <SceneBoundary onError={onSceneError}>
              <SpaceScene active={sceneActive} onReady={onSceneReady} />
            </SceneBoundary>
          )}

          {(mode === "zoom" || mode === "flight") && (
            <video
              ref={fallbackVideoRef}
              src="/videos/earth.mp4"
              autoPlay
              muted
              playsInline
              preload="auto"
              onLoadedData={onSceneReady}
              onError={onSceneReady}
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transformOrigin: "50% 69%", willChange: "transform" }}
            />
          )}

          {mode === "flight" && (
            <video
              ref={flightRef}
              src={FLIGHT_SRC}
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: 0 }}
            />
          )}

          {/* Vinheta leve: foca o olhar sem escurecer a Terra */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)",
            }}
          />
        </div>

        {/* STORM (z-20, abaixo da atmosfera) */}
        <div
          ref={stormSceneRef}
          className="pointer-events-none fixed inset-0 z-20 overflow-hidden"
          style={{
            opacity: 0,
            visibility: "hidden",
            transform: "scale(1.75)",
            transformOrigin: "50% 0%",
            background: "#183441",
            willChange: "opacity, transform",
          }}
        >
          <video
            ref={stormRef}
            src="/videos/storm.mp4"
            muted
            playsInline
            preload="none"
            loop
            className="absolute inset-0 h-full w-full object-cover"
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

        {/* NUVENS / VÉU (z-45) */}
        <AtmosphereTransition ref={atmosphereRef} />

        {/* TEXTO DA STORM (z-48) */}
        <StormIntro ref={stormIntroRef} />

        {/* IDENTIDADE (z-50) */}
        <div
          ref={identityRef}
          className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center px-6 pt-[16vh] md:items-center md:justify-end md:px-[7vw] md:pt-0"
          style={{ opacity: 0 }}
        >
          <div className="w-full text-center text-white md:w-[42vw] md:max-w-[720px] md:text-left">
            <p
              className={`${mono.className} mb-4 text-[11px] uppercase tracking-[0.32em] text-[#9ec3e6]/80 md:mb-6 md:text-xs md:tracking-[0.4em]`}
            >
              Developer · Builder · Security
            </p>

            <h1
              className={`${display.className} text-[clamp(3rem,13vw,4.5rem)] font-bold leading-[0.9] tracking-[-0.035em] md:text-[clamp(3.6rem,6vw,6.5rem)]`}
            >
              Leonardo
              <br />
              <span className="text-white/55">Machmann</span>
            </h1>
          </div>
        </div>

        {/* INDICADOR DE SCROLL (z-50) */}
        <div
          ref={indicatorRef}
          className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 text-center"
          style={{ opacity: 0 }}
        >
          <p
            className={`${mono.className} text-[10px] uppercase tracking-[0.35em] text-white/60 md:text-[11px]`}
          >
            Scroll to enter
          </p>
          <div className="relative mx-auto mt-3 h-10 w-px overflow-hidden bg-white/15">
            <div className="absolute inset-x-0 top-0 h-1/2 animate-[scrollcue_2s_cubic-bezier(0.65,0,0.35,1)_infinite] bg-white/80" />
          </div>
        </div>
      </section>
    </div>
  );
}
