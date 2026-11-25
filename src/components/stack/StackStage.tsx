"use client";

import { useEffect, useRef } from "react";


/*
 * Controla a seção STACK sem estado React por evento:
 * - monta a cena 3D (import dinâmico de three + cannon-es) quando a seção
 *   está a ~1 viewport de distância; desmonta (libera o WebGL) quando se
 *   afasta além disso; as peças caem quando ~25% da seção aparece
 * - tooltip e painel de projetos: escrita direta no DOM (server-rendered)
 * - modo estático (reduced-motion, aparelho fraco, sem WebGL2): fica o grid
 *   de logos em SVG renderizado no servidor
 * O conteúdo (logos, nomes, painéis) vem do servidor; aqui só há a lógica.
 */
export function StackStage({ tokens }: { tokens: { id: string; name: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = ref.current;
    const section = stage?.closest<HTMLElement>("[data-stack]");
    if (!stage || !section) return;
    const tip = section.querySelector<HTMLElement>(".stack-tip")!;
    const panels = [...section.querySelectorAll<HTMLElement>("[data-panel]")];

    /* seleção (clique na peça, no grid estático ou no índice de nomes) */
    const select = (id: string) => {
      for (const p of panels) p.hidden = p.dataset.panel !== id;
      for (const b of section.querySelectorAll<HTMLElement>("[data-tech]")) b.setAttribute("aria-pressed", String(b.dataset.tech === id));
    };
    const onClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tech]");
      if (b?.dataset.tech) select(b.dataset.tech);
    };
    section.addEventListener("click", onClick);

    const html = document.documentElement;
    const gl2 = (() => {
      try {
        return !!document.createElement("canvas").getContext("webgl2");
      } catch {
        return false;
      }
    })();
    if (html.dataset.fx === "static" || !gl2) return () => section.removeEventListener("click", onClick);

    const mobile = matchMedia("(max-width: 639px)").matches;
    const list = mobile ? tokens.slice(0, 10) : tokens;

    let scene: { drop(): void; destroy(): void } | null = null;
    let loading = false;
    let wantDrop = false;
    let canvas: HTMLCanvasElement | null = null;
    let tipText = "";

    const hover = (name: string | null, x: number, y: number) => {
      if (!name) {
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
    };

    const mount = async () => {
      if (scene || loading) return;
      loading = true;
      const [{ createStackScene }, { STACK_ICONS }] = await Promise.all([import("./scene"), import("@/lib/stack-icons")]);
      loading = false;
      if (!near) return;
      canvas = document.createElement("canvas");
      canvas.className = "stack-canvas";
      canvas.setAttribute("aria-hidden", "true");
      stage.append(canvas);
      try {
        const full = list.filter((t) => STACK_ICONS[t.id]).map((t) => ({ ...t, ...STACK_ICONS[t.id] }));
        scene = createStackScene(canvas, full, { hover, select });
      } catch {
        canvas.remove();
        canvas = null;
        return;
      }
      section.dataset.live = "";
      if (wantDrop) scene.drop();
    };
    const unmount = () => {
      scene?.destroy();
      scene = null;
      canvas?.remove();
      canvas = null;
      delete section.dataset.live;
      hover(null, 0, 0);
    };

    let near = false;
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
      section.removeEventListener("click", onClick);
      unmount();
    };
  }, [tokens]);

  return <div ref={ref} className="stack-stage" />;
}
