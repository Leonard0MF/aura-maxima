"use client";

import { useEffect, useRef } from "react";

type Scene = { drop(): void; focus(id: string): void; unfocus(): void; destroy(): void };

/*
 * Controla a seção STACK sem estado React por evento:
 * - monta a cena 3D (import dinâmico de three + cannon-es) quando a seção
 *   está a ~1 viewport de distância e desmonta (libera o WebGL) ao se afastar;
 *   as peças caem quando ~25% da seção aparece
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
    if (html.dataset.fx === "static" || !gl2) return cleanup;

    /* ---------- 3D ---------- */
    const mobile = matchMedia("(max-width: 639px)").matches;
    const list = mobile ? tokens.slice(0, 10) : tokens;
    let loading = false;
    let wantDrop = false;
    let near = false;
    let canvas: HTMLCanvasElement | null = null;

    const mount = async () => {
      if (scene || loading) return;
      loading = true;
      const [{ createStackScene }, { STACK_ICONS }] = await Promise.all([import("./scene"), import("@/lib/stack-icons")]);
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
      section.dataset.live = "";
      if (wantDrop) scene.drop();
    };
    const unmount = () => {
      close();
      scene?.destroy();
      scene = null;
      canvas?.remove();
      canvas = null;
      delete section.dataset.live;
      hover(null, 0, 0);
    };

    const ioNear = new IntersectionObserver(
      ([e]) => {
        near = e.isIntersecting;
        if (near) void mount();
        else unmount();
      },
      { rootMargin: "100% 0px" },
    );
    const ioIn = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        wantDrop = true;
        scene?.drop();
      },
      { threshold: 0.25 },
    );
    ioNear.observe(stage);
    ioIn.observe(stage);

    return () => {
      ioNear.disconnect();
      ioIn.disconnect();
      unmount();
      cleanup();
    };
  }, [tokens]);

  return <div ref={ref} className="stack-stage" />;
}
