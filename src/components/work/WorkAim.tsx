"use client";

import { useEffect, useRef } from "react";

/*
 * Mira do WORK (só transform/opacity/filter/cor da borda; nada de WebGL),
 * com a Web Animations API: cada elemento guarda a SUA animação; uma nova
 * começa do estado em que a anterior estava (lido do estilo computado) e a
 * cancela, então entrar e sair rápido nunca deixa nada preso.
 *
 * Hover no bloco inteiro do projeto (desktop):
 * - 4 cantoneiras âmbar (2 px, braço 16 px) fecham de fora para dentro (250 ms)
 * - uma linha âmbar de 1 px com brilho desce UMA vez pelo print (700 ms)
 * - print levemente mais contrastado (escala ≤ 1.01)
 * - nome do projeto: decrypt (~400 ms; Decrypt trigger="event")
 * - destaques 01/02/03: 4 px para a direita, em sequência (60 ms)
 * - chips da stack: borda âmbar em sequência rápida
 * Saída: tudo volta (as cantoneiras abrem e somem); o scan só no próximo hover.
 * As setas dos links deslizam 3 px no hover de cada link (CSS).
 *
 * Toque: tudo uma vez quando o print do projeto entra ~50% na tela e de novo a cada
 * toque no print. reduced-motion: só as cantoneiras (sem movimento).
 */
const AMBER = "rgb(245, 165, 36)";
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const OUT = ["translate(-14px, -14px)", "translate(14px, -14px)", "translate(-14px, 14px)", "translate(14px, 14px)"];

export function WorkAim() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const aim = ref.current!;
    const win = aim.closest<HTMLElement>(".work-win");
    const item = aim.closest<HTMLElement>(".work-item");
    if (!win || !item) return;
    const corners = [...aim.querySelectorAll<HTMLElement>("i")];
    const scan = aim.querySelector<HTMLElement>(".work-scan")!;
    const media = win.querySelector<HTMLElement>(".work-media");
    const name = item.querySelector<HTMLElement>(".work-name [data-decrypt]");
    const hls = [...item.querySelectorAll<HTMLElement>(".work-hl > li")];
    const chips = [...item.querySelectorAll<HTMLElement>(".chip")];
    const arrows = [...item.querySelectorAll<HTMLElement>(".work-arrow")];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const hover = matchMedia("(hover: hover) and (pointer: fine)");
    const anims = new WeakMap<Element, Animation>();
    const chipBorder = chips[0] ? getComputedStyle(chips[0]).borderColor : "";
    let off = 0;
    let on = false;

    /* do estado atual até `to` (cancela a animação anterior do elemento) */
    const to = (el: Element, kf: Record<string, string>, ms: number, delay = 0) => {
      const cs = getComputedStyle(el);
      const from: Record<string, string> = {};
      for (const k of Object.keys(kf)) from[k] = cs.getPropertyValue(k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()));
      anims.get(el)?.cancel();
      const a = el.animate([from, kf], { duration: ms, delay, easing: EASE, fill: "forwards" });
      anims.set(el, a);
      return a;
    };

    const enter = () => {
      on = true;
      item.dataset.aim = "";
      const calm = reduced.matches;
      corners.forEach((c) => to(c, { opacity: "1", transform: "translate(0px, 0px)" }, calm ? 1 : 250));
      if (calm) return;
      /* scan: uma passada por entrada (a anterior é cancelada) */
      anims.get(scan)?.cancel();
      anims.set(
        scan,
        scan.animate(
          [
            { transform: "translateY(0)", opacity: 0 },
            { opacity: 1, offset: 0.08 },
            { opacity: 1, offset: 0.9 },
            { transform: "translateY(100%)", opacity: 0 },
          ],
          { duration: 700, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
        ),
      );
      if (media) to(media, { transform: "scale(1.01)", filter: "contrast(1.07) saturate(1.04)" }, 450);
      name?.dispatchEvent(new Event("decrypt"));
      hls.forEach((h, j) => to(h, { transform: "translateX(4px)" }, 220, j * 60));
      chips.forEach((c, j) => to(c, { borderColor: AMBER }, 160, 80 + j * 35));
    };
    const leave = () => {
      if (!on) return;
      on = false;
      delete item.dataset.aim;
      corners.forEach((c, k) => to(c, { opacity: "0", transform: OUT[k] }, reduced.matches ? 1 : 220));
      if (reduced.matches) return;
      if (media) to(media, { transform: "scale(1)", filter: "contrast(1) saturate(1)" }, 300);
      name?.dispatchEvent(new Event("decrypt-stop"));
      hls.forEach((h) => to(h, { transform: "translateX(0px)" }, 200));
      chips.forEach((c) => to(c, { borderColor: chipBorder }, 200));
    };
    /* toque: tudo uma vez (setas incluídas) e volta sozinho */
    const once = () => {
      clearTimeout(off);
      enter();
      if (!reduced.matches) arrows.forEach((a, j) => a.animate([{ transform: "translateX(0)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 500, delay: 300 + j * 60, easing: EASE }));
      off = window.setTimeout(leave, 1200);
    };

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return; // mouse em cima = há hover
      clearTimeout(off);
      enter();
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") leave();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") once();
    };
    item.addEventListener("pointerenter", onEnter);
    item.addEventListener("pointerleave", onLeave);
    win.addEventListener("pointerdown", onDown);

    /* sem hover (toque): uma vez ao entrar ~50% na tela */
    let io: IntersectionObserver | null = null;
    if (!hover.matches) {
      io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          io?.disconnect();
          once();
        },
        { threshold: 0.5 },
      );
      io.observe(win); // o print (o bloco inteiro pode ser mais alto que a tela)
    }

    return () => {
      clearTimeout(off);
      io?.disconnect();
      item.removeEventListener("pointerenter", onEnter);
      item.removeEventListener("pointerleave", onLeave);
      win.removeEventListener("pointerdown", onDown);
      for (const el of [...corners, scan, ...(media ? [media] : []), ...hls, ...chips]) anims.get(el)?.cancel();
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
