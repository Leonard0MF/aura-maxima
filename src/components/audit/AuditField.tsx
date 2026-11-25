"use client";

import { useEffect, useRef, useState } from "react";

import type { AuditNode, CheckStatus } from "@/content/audit";
import { claimGL } from "@/lib/gl-slot";

import type { Constellation } from "./scene";

const STATUS: Record<CheckStatus, { label: string; cls: string }> = {
  pass: { label: "ok", cls: "bg-[#8fd6a8]" },
  warn: { label: "atenção", cls: "bg-accent" },
  fail: { label: "falha", cls: "bg-[#ff8a80]" },
  info: { label: "info", cls: "bg-[#a3acb6]" },
};

/*
 * Camada interativa do AUDIT: a constelação (WebGL) atrás do texto da seção.
 * - hover/toque num nó brilhante: cartão com o dado
 * - arrastar: gira (o scroll vertical nunca é capturado: touch-action pan-y,
 *   nenhum listener de wheel)
 * - clique no vazio: onda de scan; os nós acendem em sequência e a nota
 *   aparece grande ao lado
 * Fallback (reduced-motion, aparelho fraco, sem WebGL): imagem estática da
 * mesma rede + a lista dos dados em texto (que sempre existe para leitores
 * de tela).
 */
export function AuditField({ nodes, grade, score, example }: { nodes: AuditNode[]; grade: string | null; score: number | null; example: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState(-1);
  const [lit, setLit] = useState<number[]>([]);
  const [reveal, setReveal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const sceneRef = useRef<Constellation | null>(null);
  const cardIdx = useRef(-1);

  useEffect(() => {
    const field = ref.current!;
    const section = field.closest("section")!;
    const gl = (() => {
      try {
        return !!document.createElement("canvas").getContext("webgl2");
      } catch {
        return false;
      }
    })();
    const fallback = () => {
      section.dataset.static = "";
      void import("./layout").then(({ makeLayout, projectStatic }) => setSvg(staticSvg(makeLayout, projectStatic, nodes.length)));
    };
    if (document.documentElement.dataset.fx === "static" || !gl) {
      fallback();
      return;
    }

    const mobile = matchMedia("(max-width: 639px)").matches;
    let scene: Constellation | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let want = false; // esta seção é a dona do WebGL
    let pending: Promise<void> | null = null;
    let visible = false;
    let follow = 0;

    const sync = () => scene?.run(visible && !document.hidden);
    const mount = async () => {
      if (scene) return;
      const { createConstellation } = await import("./scene");
      if (!want || scene) return;
      canvas = document.createElement("canvas");
      canvas.className = "audit-canvas";
      canvas.setAttribute("aria-hidden", "true");
      field.prepend(canvas);
      try {
        scene = createConstellation(canvas, nodes.length, { count: mobile ? 1500 : 4500, onLost: () => {
            unmount();
            fallback();
          },
        });
      } catch {
        canvas.remove();
        canvas = null;
        fallback();
        return;
      }
      sceneRef.current = scene;
      section.dataset.live = "";
      sync();
    };
    const unmount = () => {
      cancelAnimationFrame(follow);
      scene?.destroy();
      scene = null;
      sceneRef.current = null;
      canvas?.remove();
      canvas = null;
      delete section.dataset.live;
      cardIdx.current = -1;
      setCard(-1);
    };
    const release = claimGL({
      el: field,
      mount() {
        want = true;
        pending = mount().finally(() => (pending = null));
      },
      async unmount() {
        want = false;
        await pending;
        unmount();
      },
    });

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sync();
    });
    io.observe(field);
    document.addEventListener("visibilitychange", sync);

    /* ---------- interação ---------- */
    const pos = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    /* o cartão segue o nó enquanto a rede gira (escrita direta no DOM) */
    const place = () => {
      follow = 0;
      const i = cardIdx.current;
      const el = cardRef.current;
      if (!scene || i < 0) return;
      if (!el) {
        follow = requestAnimationFrame(place); // o cartão ainda não foi renderizado
        return;
      }
      const p = scene.nodeAt(i);
      const w = field.clientWidth;
      const left = p.x + 18 + el.offsetWidth > w - 12 ? p.x - 18 - el.offsetWidth : p.x + 18;
      const top = Math.max(8, Math.min(field.clientHeight - el.offsetHeight - 8, p.y - el.offsetHeight / 2));
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      el.style.visibility = "visible";
      follow = requestAnimationFrame(place);
    };
    const show = (i: number) => {
      if (cardIdx.current === i) return;
      cardIdx.current = i;
      scene?.hover(i);
      setCard(i);
      cancelAnimationFrame(follow);
      if (i >= 0) follow = requestAnimationFrame(place);
    };

    let down: { x: number; y: number; id: number; drag: boolean } | null = null;
    const onMove = (e: PointerEvent) => {
      if (!scene) return;
      const p = pos(e);
      if (down && down.id === e.pointerId) {
        const dx = p.x - down.x;
        const dy = p.y - down.y;
        if (!down.drag && Math.hypot(dx, dy) > 6) {
          down.drag = true;
          field.setPointerCapture(e.pointerId);
          show(-1);
        }
        if (down.drag) {
          scene.dragBy(dx, dy);
          down.x = p.x;
          down.y = p.y;
          return;
        }
      }
      scene.pointer(p.x, p.y, true);
      if (e.pointerType === "mouse") {
        const i = scene.hit(p.x, p.y);
        field.style.cursor = i >= 0 ? "pointer" : "";
        show(i);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!scene || e.button > 0) return;
      const p = pos(e);
      down = { ...p, id: e.pointerId, drag: false };
    };
    const onUp = (e: PointerEvent) => {
      if (!scene || !down || down.id !== e.pointerId) return;
      const wasDrag = down.drag;
      down = null;
      if (wasDrag) return;
      const p = pos(e);
      const i = scene.hit(p.x, p.y);
      if (i >= 0) {
        show(cardIdx.current === i && e.pointerType !== "mouse" ? -1 : i); // toque: abre/fecha
        return;
      }
      show(-1);
      setLit([]);
      setReveal(false);
      setScanning(true);
      scene.wave(
        p.x,
        p.y,
        (k) => setLit((l) => [...l, k]),
        () => {
          setScanning(false);
          setReveal(true);
        },
      );
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") show(-1);
      scene?.pointer(0, 0, false);
    };
    const onCancel = () => {
      down = null;
      scene?.pointer(0, 0, false);
    };
    field.addEventListener("pointermove", onMove);
    field.addEventListener("pointerdown", onDown);
    field.addEventListener("pointerup", onUp);
    field.addEventListener("pointerleave", onLeave);
    field.addEventListener("pointercancel", onCancel);

    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      field.removeEventListener("pointermove", onMove);
      field.removeEventListener("pointerdown", onDown);
      field.removeEventListener("pointerup", onUp);
      field.removeEventListener("pointerleave", onLeave);
      field.removeEventListener("pointercancel", onCancel);
      release();
      unmount();
      delete section.dataset.static;
    };
  }, [nodes]);

  const node = card >= 0 ? nodes[card] : null;

  return (
    <div ref={ref} className="audit-field">
      {svg && <div className="audit-static" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />}

      {node && (
        <div ref={cardRef} className="audit-card" role="status">
          <p className="flex items-center gap-2 text-[10px] tracking-wide text-dim uppercase">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${STATUS[node.status].cls}`} />
            {STATUS[node.status].label} · {node.label}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-paper">{node.value}</p>
        </div>
      )}

      {(scanning || reveal) && (
        <p className="audit-progress font-mono text-[11px] tracking-wide text-dim uppercase" aria-live="polite">
          {scanning ? `scan · ${lit.length}/${nodes.length} nós` : reveal ? `scan completo · ${nodes.length}/${nodes.length} nós` : ""}
        </p>
      )}

      {reveal && (
        <div className={`audit-grade ${grade ? "" : "audit-grade--none"}`} role="status">
          <span className="font-display leading-none">{grade ?? "—"}</span>
          <span className="font-mono text-[11px] tracking-wide uppercase">
            {grade ? `${score ?? "—"}/100 · Aegis` : example ? "sem nota · dados de exemplo" : "nota pendente"}
          </span>
        </div>
      )}
    </div>
  );
}

/* imagem estática: a mesma rede, projetada sem rotação, em SVG */
function staticSvg(
  makeLayout: typeof import("./layout").makeLayout,
  projectStatic: typeof import("./layout").projectStatic,
  n: number,
) {
  const W = 1600;
  const H = 800;
  const L = makeLayout(n, 1400);
  const P = (i: number, a: Float32Array) => projectStatic(a[i * 3], a[i * 3 + 1], a[i * 3 + 2], W, H);
  let dots = "";
  for (let i = 0; i < L.count; i++) {
    const p = P(i, L.points);
    const c = L.tones[i] > 0.5 ? "#f5a524" : "#ece9e0";
    dots += `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="${(L.sizes[i] * 1.1 * p.s).toFixed(1)}" fill="${c}" fill-opacity="${L.tones[i] > 0.5 ? 0.55 : 0.4}"/>`;
  }
  const lines = L.links
    .map(([a, b]) => {
      const p = P(a, L.nodes);
      const q = P(b, L.nodes);
      return `<line x1="${p.x.toFixed(0)}" y1="${p.y.toFixed(0)}" x2="${q.x.toFixed(0)}" y2="${q.y.toFixed(0)}"/>`;
    })
    .join("");
  const nodes = Array.from({ length: n }, (_, i) => {
    const p = P(i, L.nodes);
    return `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="14" fill="#f5a524" fill-opacity=".18"/><circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="4" fill="#fff3d6"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><g stroke="#f5a524" stroke-opacity=".22" stroke-width="1">${lines}</g>${dots}${nodes}</svg>`;
}
