"use client";

import { useEffect, useRef } from "react";

/*
 * Mira sobre o print do WORK (só CSS: transform/opacity; nada de WebGL).
 * Liga data-aim no .work-item e o CSS faz o resto:
 * - 4 cantoneiras âmbar (2 px, braço de 16 px) se fecham de fora para dentro
 *   em ~250 ms; ao sair, se abrem e somem
 * - uma linha âmbar de 1 px com brilho desce UMA vez pelo print (~700 ms)
 * - o print fica levemente mais contrastado (escala no máximo 1.01)
 * - o nome do projeto faz o decrypt rápido (~400 ms) (Decrypt trigger="event")
 *
 * Desktop (hover: hover): enquanto o mouse está no print; o scan só repete
 * no próximo hover. Toque: uma vez quando o projeto entra ~50% na tela e a
 * cada toque no print (que continua abrindo o estudo de caso).
 * reduced-motion: só as cantoneiras (sem scan nem decrypt; o CSS e o
 * Decrypt já respeitam).
 */
export function WorkAim() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const aim = ref.current!;
    const win = aim.closest<HTMLElement>(".work-win");
    const item = aim.closest<HTMLElement>(".work-item");
    if (!win || !item) return;
    const name = item.querySelector<HTMLElement>(".work-name [data-decrypt]");
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    let off = 0;

    const play = (hold: boolean) => {
      clearTimeout(off);
      /* reinicia o scan se já estava ligado (toques seguidos) */
      if ("aim" in item.dataset) {
        delete item.dataset.aim;
        void item.offsetWidth;
      }
      item.dataset.aim = "";
      name?.dispatchEvent(new Event("decrypt"));
      if (!hold) off = window.setTimeout(() => delete item.dataset.aim, 1100);
    };
    const leave = () => {
      clearTimeout(off);
      delete item.dataset.aim;
    };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") play(true); // mouse em cima = há hover, seja qual for a media query
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") leave();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") play(false);
    };
    win.addEventListener("pointerenter", onEnter);
    win.addEventListener("pointerleave", onLeave);
    win.addEventListener("pointerdown", onDown);

    /* sem hover (toque): uma vez ao entrar ~50% na tela */
    let io: IntersectionObserver | null = null;
    if (!hover.matches) {
      io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          io?.disconnect();
          play(false);
        },
        { threshold: 0.5 },
      );
      io.observe(win);
    }

    return () => {
      clearTimeout(off);
      io?.disconnect();
      win.removeEventListener("pointerenter", onEnter);
      win.removeEventListener("pointerleave", onLeave);
      win.removeEventListener("pointerdown", onDown);
      delete item.dataset.aim;
    };
  }, []);

  return (
    <span ref={ref} className="work-aim" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <b className="work-scan" />
    </span>
  );
}
