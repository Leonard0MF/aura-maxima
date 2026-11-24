"use client";

import { useEffect } from "react";

import { lens } from "./lens-state";

/*
 * Move a lente: segue o ponteiro com lerp; sem input (touch sem toque,
 * mouse fora do hero), passeia sozinha numa curva de Lissajous.
 * Escreve só variáveis CSS (--lx/--ly/--lr) e o objeto `lens`: zero re-render.
 */
export function LensController({ targetId }: { targetId: string }) {
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = el.clientWidth;
    let h = el.clientHeight;
    const radius = () => (w < 640 ? 66 : 90);
    lens.r = radius();
    lens.x = w * 0.62;
    lens.y = h * 0.5;
    let tx = lens.x;
    let ty = lens.y;
    let lastInput = -Infinity;
    let raf = 0;
    let visible = true;
    const t0 = performance.now();

    const write = () => {
      el.style.setProperty("--lx", `${lens.x.toFixed(1)}px`);
      el.style.setProperty("--ly", `${lens.y.toFixed(1)}px`);
      el.style.setProperty("--lr", `${lens.r}px`);
    };

    const frame = (now: number) => {
      raf = 0;
      const idle = now - lastInput > 2500;
      if (idle && !reduce) {
        const t = (now - t0) / 1000;
        tx = w * (0.5 + 0.26 * Math.sin(t * 0.31));
        ty = h * (0.5 + 0.2 * Math.sin(t * 0.47 + 1.3));
      }
      const k = idle ? 0.03 : 0.14;
      lens.x += (tx - lens.x) * k;
      lens.y += (ty - lens.y) * k;
      lens.mx = (lens.x / w) * 2 - 1;
      lens.my = -((lens.y / h) * 2 - 1);
      write();
      schedule();
    };
    const schedule = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      lastInput = performance.now();
      schedule();
    };
    const onResize = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      lens.r = radius();
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerdown", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      schedule();
    });
    io.observe(el);
    const onVis = () => schedule();
    document.addEventListener("visibilitychange", onVis);
    write();
    schedule();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [targetId]);

  return null;
}
