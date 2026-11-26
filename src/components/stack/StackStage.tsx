"use client";

import { useEffect, useRef } from "react";
import { claimGL } from "@/lib/gl-slot";

type Saved = { id: string; x: number; z: number; yaw: number }[];
type Scene = {
  drop(): void;
  restore(s: Saved): void;
  highlight(ids: string[] | null): void;
  bump(id: string): boolean;
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
 * - índice → 3D: clicar (ou hover, no desktop) numa categoria destaca as
 *   moedas dela e apaga as outras; clicar de novo limpa. Clicar num item que
 *   tem moeda faz a moeda pular e abre o popup dela
 * - tooltip e dialog: escrita direta no DOM renderizado no servidor
 * - dialog: foco preso, Esc / X / clique fora fecham, foco volta para quem abriu
 * - modo estático (reduced-motion, aparelho fraco, sem WebGL2): grid de SVG;
 *   o dialog funciona igual, só sem a peça voando
 */
export function StackStage({ tokens, mobile: mobileIds, cats }: { tokens: { id: string; name: string }[]; mobile: string[]; cats: Record<string, string[]> }) {
  const ref = useRef<HTMLDivElement>(null);

  /* dica de uso: na primeira vez que o índice entra na tela, o "+" da
   * primeira categoria pulsa duas vezes (uma vez por sessão; sem animação
   * com reduced-motion, que o CSS já corta) */
  useEffect(() => {
    const ix = ref.current?.closest("[data-stack]")?.querySelector<HTMLElement>(".stack-index");
    const first = ix?.querySelector<HTMLElement>(".stack-cat__btn");
    if (!ix || !first) return;
    const KEY = "stack-hint";
    try {
      if (sessionStorage.getItem(KEY)) return;
    } catch {
      /* sem storage: pulsa nesta visita */
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        try {
          sessionStorage.setItem(KEY, "1");
        } catch {
          /* ignora */
        }
        first.dataset.pulse = "";
        first.addEventListener("animationend", () => delete first.dataset.pulse, { once: true });
      },
      { threshold: 0.5 },
    );
    io.observe(first);
    return () => io.disconnect();
  }, []);

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
      if (!openId && !returnFocus) returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
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
    /* ---------- filtro por categoria ---------- */
    const catBtns = [...section.querySelectorAll<HTMLButtonElement>("[data-cat-btn]")];
    const cells = [...section.querySelectorAll<HTMLElement>("[data-cell]")];
    let picked: string | null = null; // categoria fixada por clique
    const show = (cat: string | null) => {
      /* categoria sem moedas (ex.: conceitos): abre o texto, sem filtro no 3D */
      const ids = cat && cats[cat]?.length ? cats[cat] : null;
      scene?.highlight(ids);
      for (const c of cells) c.toggleAttribute("data-dim", !!ids && !ids.includes(c.dataset.tech!));
      if (cat) section.dataset.cat = cat;
      else delete section.dataset.cat;
    };
    const pick = (cat: string | null) => {
      picked = cat;
      /* acordeão: só a categoria escolhida fica aberta */
      for (const b of catBtns) {
        const on = b.dataset.catBtn === cat;
        b.setAttribute("aria-expanded", String(on));
        b.closest(".stack-cat")?.toggleAttribute("data-open", on);
      }
      show(cat);
      /* telas baixas: o índice rola por dentro até a categoria aberta caber
       * (só o índice; a página não se mexe) */
      const ix = section.querySelector<HTMLElement>(".stack-index");
      const el = cat ? section.querySelector<HTMLElement>(`.stack-cat[data-cat="${cat}"]`) : null;
      if (ix && el && ix.scrollHeight > ix.clientHeight) {
        const r = el.getBoundingClientRect(), q = ix.getBoundingClientRect();
        if (r.bottom > q.bottom) ix.scrollBy({ top: Math.min(r.bottom - q.bottom + 12, r.top - q.top), behavior: "smooth" });
      }
    };
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const onOver = (e: PointerEvent) => {
      if (!fine.matches || e.pointerType !== "mouse") return;
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-cat-btn]");
      if (b && !picked) show(b.dataset.catBtn!);
    };
    const onOut = (e: PointerEvent) => {
      if (!fine.matches || e.pointerType !== "mouse") return;
      const b = (e.target as HTMLElement).closest("[data-cat-btn]");
      if (b && !picked && !b.contains(e.relatedTarget as Node)) show(null);
    };

    let bumpT = 0;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cb = target.closest<HTMLButtonElement>("[data-cat-btn]");
      if (cb) return pick(picked === cb.dataset.catBtn ? null : cb.dataset.catBtn!);
      const b = target.closest<HTMLElement>("[data-tech]");
      if (b?.dataset.tech) {
        const id = b.dataset.tech;
        /* do índice: a moeda pula na mesa e o popup abre logo depois */
        if (b.closest(".stack-index") && scene?.bump(id)) {
          clearTimeout(bumpT);
          returnFocus = b;
          bumpT = window.setTimeout(() => open(id), 380);
          return;
        }
        return open(id);
      }
      if (target.closest(".stack-close")) return close();
    };
    section.addEventListener("pointerover", onOver);
    section.addEventListener("pointerout", onOut);
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
      clearTimeout(bumpT);
      section.removeEventListener("pointerover", onOver);
      section.removeEventListener("pointerout", onOut);
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
    const list = mobile ? tokens.filter((t) => mobileIds.includes(t.id)) : tokens;
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
      if (section.dataset.cat) scene.highlight(cats[section.dataset.cat] ?? null);
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
  }, [tokens, mobileIds, cats]);

  return (
    <div ref={ref} className="stack-stage">
      <div className="stack-ph" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element -- data: URL gerada no cliente */}
      <img className="stack-snap" alt="" aria-hidden="true" />
    </div>
  );
}
