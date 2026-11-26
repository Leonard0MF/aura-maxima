"use client";

import { useEffect, useRef } from "react";
import { claimGL } from "@/lib/gl-slot";

type Saved = { id: string; x: number; z: number; yaw: number }[];
type Scene = {
  drop(): void;
  restore(s: Saved): void;
  state(): Saved;
  snapshot(): string | null;
  focus(id: string): void;
  unfocus(): void;
  destroy(): void;
  debug(): unknown;
};

/*
 * Controla a seção STACK sem estado React por evento:
 * - baixa o código da cena a ~1,5 viewport de distância e monta a cena 3D
 *   quando a seção é a dona do WebGL (lib/gl-slot); ao se afastar, desmonta
 *   (libera o contexto) e deixa no lugar um snapshot do último frame; ao
 *   voltar, as peças reaparecem onde estavam (sem nova queda)
 * - enquanto nada está pronto, a área mostra só um placeholder do mesmo
 *   tamanho; a lista em texto fica sr-only (visível só no modo estático)
 * - as peças caem quando ~25% da seção aparece
 * - tooltip e dialog: escrita direta no DOM renderizado no servidor
 * - dialog: foco preso, Esc / X / clique fora fecham, foco volta para quem abriu
 * - modo estático (reduced-motion, aparelho fraco, sem WebGL2): grid de SVG;
 *   o dialog funciona igual, só sem a peça voando
 */
export function StackStage({ tokens }: { tokens: { id: string; name: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;
    const section = stage?.closest<HTMLElement>("[data-stack]");
    const box = stage?.parentElement;
    if (!stage || !section || !box) return;
    const tip = box.querySelector<HTMLElement>(".stack-tip")!;
    const dialog = box.querySelector<HTMLElement>(".stack-dialog")!;
    const closeBtn = dialog.querySelector<HTMLButtonElement>(".stack-close")!;
    const panels = [...dialog.querySelectorAll<HTMLElement>("[data-panel]")];

    let scene: Scene | null = null;
    let openId: string | null = null;
    let returnFocus: HTMLElement | null = null;

    /* ---------- dialog ---------- */
    const open = (id: string) => {
      if (openId === id) return;
      if (!openId) returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      openId = id;
      for (const p of panels) p.hidden = p.dataset.panel !== id;
      dialog.setAttribute("aria-labelledby", `tech-${id}`);
      dialog.hidden = false;
      closeBtn.focus({ preventScroll: true });
      scene?.focus(id);
      hover(null, 0, 0);
    };
    const close = () => {
      if (!openId) return;
      openId = null;
      dialog.hidden = true;
      scene?.unfocus();
      returnFocus?.focus({ preventScroll: true });
      returnFocus = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (!openId) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
        const f = [...dialog.querySelectorAll<HTMLElement>("button, a[href]")].filter((el) => !el.closest("[hidden]"));
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!dialog.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const b = target.closest<HTMLElement>("[data-tech]");
      if (b?.dataset.tech) return open(b.dataset.tech);
      if (target.closest(".stack-close")) return close();
    };
    /* clique fora do painel fecha (o canvas avisa pela cena) */
    const onDown = (e: PointerEvent) => {
      if (openId && !dialog.contains(e.target as Node) && !(e.target as HTMLElement).closest(".stack-canvas")) close();
    };
    document.addEventListener("keydown", onKey);
    section.addEventListener("click", onClick);
    document.addEventListener("pointerdown", onDown);

    let tipText = "";
    function hover(name: string | null, x: number, y: number) {
      if (!name || openId) {
        if (tipText) {
          tipText = "";
          tip.hidden = true;
        }
        return;
      }
      if (name !== tipText) {
        tipText = name;
        tip.textContent = name;
        tip.hidden = false;
      }
      tip.style.transform = `translate3d(${Math.round(x + 14)}px,${Math.round(y + 14)}px,0)`;
    }

    const cleanup = () => {
      document.removeEventListener("keydown", onKey);
      section.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onDown);
    };

    const html = document.documentElement;
    const gl2 = (() => {
      try {
        return !!document.createElement("canvas").getContext("webgl2");
      } catch {
        return false;
      }
    })();
    if (html.dataset.fx === "static" || !gl2) {
      section.dataset.static = "";
      return () => {
        delete section.dataset.static;
        cleanup();
      };
    }

    /* ---------- 3D ---------- */
    const mobile = matchMedia("(max-width: 639px)").matches;
    const list = mobile ? tokens.slice(0, 10) : tokens;
    let loading = false;
    let wantDrop = false;
    let near = false;
    let canvas: HTMLCanvasElement | null = null;
    let saved: Saved | null = null;
    const snap = stage.querySelector<HTMLImageElement>(".stack-snap")!;

    /* pré-carga do código (three + física + ícones) bem antes de chegar */
    const load = () => Promise.all([import("./scene"), import("@/lib/stack-icons")]);
    const ioPre = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        ioPre.disconnect();
        void load();
      },
      { rootMargin: "150% 0px" },
    );
    ioPre.observe(stage);

    let pending: Promise<void> | null = null; // montagem em andamento
    const mount = async () => {
      if (scene || loading) return;
      loading = true;
      const [{ createStackScene }, { STACK_ICONS }] = await load();
      if (!near) {
        loading = false;
        return;
      }
      canvas = document.createElement("canvas");
      canvas.className = "stack-canvas";
      canvas.setAttribute("aria-hidden", "true");
      stage.append(canvas);
      const mine = canvas;
      let made: Scene;
      try {
        const full = list.filter((t) => STACK_ICONS[t.id]).map((t) => ({ ...t, ...STACK_ICONS[t.id] }));
        made = await createStackScene(mine, full, { hover, select: open, close });
      } catch {
        mine.remove();
        if (canvas === mine) canvas = null;
        loading = false;
        return;
      }
      loading = false;
      /* saiu de perto enquanto montava: descarta */
      if (!near || canvas !== mine) {
        made.destroy();
        mine.remove();
        if (near && !scene) void mount(); // voltou para perto no meio da montagem
        return;
      }
      scene = made;
      /* testes automatizados (?stackdebug): expõe o estado da mesa */
      if (location.search.includes("stackdebug")) (window as unknown as { __stack?: Scene }).__stack = made;
      if (saved?.length) scene.restore(saved);
      else if (wantDrop) scene.drop();
      /* o canvas só aparece depois do primeiro frame (sem piscar vazio) */
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (scene === made) section.dataset.live = "";
      }));
    };
    const unmount = () => {
      close();
      if (scene) {
        const st = scene.state();
        if (st.length) saved = st;
        const url = scene.snapshot();
        if (url) {
          snap.src = url;
          section.dataset.snap = "";
        }
      }
      scene?.destroy();
      scene = null;
      canvas?.remove();
      canvas = null;
      delete section.dataset.live;
      hover(null, 0, 0);
    };

    /* um contexto WebGL por vez entre STACK e AUDIT (lib/gl-slot): monta
     * quando esta seção é a dona; ao perder, só "libera" depois que uma
     * montagem em andamento terminou e foi descartada */
    const releaseGL = claimGL({
      el: stage,
      mount() {
        near = true;
        pending = mount().finally(() => (pending = null));
      },
      async unmount() {
        near = false;
        unmount();
        await pending;
      },
    });
    const ioIn = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        wantDrop = true;
        scene?.drop();
      },
      { threshold: 0.25 },
    );
    ioIn.observe(stage);

    return () => {
      releaseGL();
      ioIn.disconnect();
      ioPre.disconnect();
      unmount();
      cleanup();
    };
  }, [tokens]);

  return (
    <div ref={ref} className="stack-stage">
      <div className="stack-ph" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL gerada no cliente */}
      <img className="stack-snap" alt="" aria-hidden="true" />
    </div>
  );
}
