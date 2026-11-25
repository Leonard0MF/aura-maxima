"use client";

import { useEffect, useRef, useState } from "react";

import type { AuditNode, CheckStatus } from "@/content/audit";
import { claimGL } from "@/lib/gl-slot";

import type { Constellation } from "./scene";

const STATUS: Record<CheckStatus, string> = {
  pass: "bg-[#8fd6a8]",
  warn: "bg-accent",
  fail: "bg-[#ff8a80]",
  info: "bg-[#a3acb6]",
};

/* textos do servidor (messages: audit.*); progress/done usam {lit} e {total} */
export type AuditLabels = { status: Record<string, string>; progress: string; done: string; gradeExample: string; gradePending: string };
const fill = (s: string, v: Record<string, number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/*
 * Camada interativa do AUDIT: buraco negro + constelação (WebGL) atrás do
 * texto da seção.
 * - hover/toque num nó brilhante: cartão com o dado
 * - arrastar: gira o sistema em volta do buraco negro (o scroll vertical nunca
 *   é capturado: touch-action pan-y, nenhum listener de wheel)
 * - clique no vazio: onda de scan saindo do horizonte; os nós acendem em
 *   sequência e a nota aparece grande ao lado
 * Celular e máquinas fracas: versão simplificada (sem o pass de lente).
 * Fallback (reduced-motion, aparelho fraco, sem WebGL): imagem estática da
 * mesma cena + a lista dos dados em texto (que sempre existe para leitores
 * de tela).
 */
export function AuditField({ nodes, grade, score, example, labels }: { nodes: AuditNode[]; grade: string | null; score: number | null; example: boolean; labels: AuditLabels }) {
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
      void import("./layout").then((lay) => setSvg(staticSvg(lay, nodes.length)));
    };
    if (document.documentElement.dataset.fx === "static" || !gl) {
      fallback();
      return;
    }

    const mobile = matchMedia("(max-width: 639px)").matches;
    /* sem o pass de lente: celular/toque e máquinas com poucos núcleos (o resto
     * a cena decide sozinha medindo o fps) */
    const simple = mobile || matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4;
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
        scene = createConstellation(canvas, nodes.length, { count: mobile ? 1500 : 4500, simple, onLost: () => {
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
            <span aria-hidden="true" className={`size-1.5 rounded-full ${STATUS[node.status]}`} />
            {labels.status[node.status]} · {node.label}
          </p>
          <p className="mt-1.5 text-[12px] leading-snug text-paper">{node.value}</p>
        </div>
      )}

      {(scanning || reveal) && (
        <p className="audit-progress font-mono text-[11px] tracking-wide text-dim uppercase" aria-live="polite">
          {scanning ? fill(labels.progress, { lit: lit.length, total: nodes.length }) : reveal ? fill(labels.done, { total: nodes.length }) : ""}
        </p>
      )}

      {reveal && (
        <div className={`audit-grade ${grade ? "" : "audit-grade--none"}`} role="status">
          <span className="font-display leading-none">{grade ?? "—"}</span>
          <span className="font-mono text-[11px] tracking-wide uppercase">
            {grade ? `${score ?? "—"}/100 · Aegis` : example ? labels.gradeExample : labels.gradePending}
          </span>
        </div>
      )}
    </div>
  );
}

/* imagem estática: a mesma cena no instante 0 (buraco negro + rede), em SVG */
function staticSvg(lay: typeof import("./layout"), n: number) {
  const { makeLayout, orbitPos, projectStatic, HALF_H, DUST_TILT } = lay;
  const W = 1600;
  const H = 800;
  const L = makeLayout(n, 1400);
  const bx = -0.5 * HALF_H * (W / H); // buraco negro no terço esquerdo
  const P = (x: number, y: number, z: number) => projectStatic(x + bx, y, z, W, H);
  const nodes = L.orbits.map((o) => orbitPos(o, 0));
  const c = Math.cos(DUST_TILT), s = Math.sin(DUST_TILT);
  let dots = "";
  for (let i = 0; i < L.count; i++) {
    const [px, py, pz] = L.points.subarray(i * 3, i * 3 + 3);
    const [kind, a, b, t] = L.ref.subarray(i * 4, i * 4 + 4);
    let q: number[];
    if (kind === 0) q = [nodes[a][0] + px, nodes[a][1] + py, nodes[a][2] + pz];
    else if (kind === 1) q = [0, 1, 2].map((k) => nodes[a][k] + (nodes[b][k] - nodes[a][k]) * t + [px, py, pz][k]);
    else {
      const r0 = kind === 2 ? px : px * Math.sqrt(1 - L.seeds[i]);
      const h = kind === 2 ? pz : 0;
      q = [Math.cos(py) * r0, Math.sin(py) * r0 * c - h * s, Math.sin(py) * r0 * s + h * c];
      if (Math.hypot(q[0], q[1]) < 0.5) continue; // dentro da sombra
    }
    const p = P(q[0], q[1], q[2]);
    const col = L.tones[i] > 0.5 ? "#f5a524" : "#ece9e0";
    dots += `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="${(L.sizes[i] * 1.1 * p.s).toFixed(1)}" fill="${col}" fill-opacity="${L.tones[i] > 0.5 ? 0.55 : 0.4}"/>`;
  }
  const lines = L.pairs
    .map(([a, b]) => {
      const p = P(nodes[a][0], nodes[a][1], nodes[a][2]);
      const q = P(nodes[b][0], nodes[b][1], nodes[b][2]);
      return `<line x1="${p.x.toFixed(0)}" y1="${p.y.toFixed(0)}" x2="${q.x.toFixed(0)}" y2="${q.y.toFixed(0)}"/>`;
    })
    .join("");
  const nodeDots = nodes
    .map(([x, y, z]) => {
      const p = P(x, y, z);
      return `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="14" fill="#f5a524" fill-opacity=".18"/><circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="4" fill="#fff3d6"/>`;
    })
    .join("");
  /* buraco negro: arco de trás (imagem curvada do disco), horizonte, anel de fótons, frente do disco */
  const o = P(0, 0, 0);
  const rs = H * 0.026;
  const sh = 2.6 * rs;
  const hole = `<defs>
<radialGradient id="bh-arc" cx="${o.x}" cy="${o.y}" r="${(7.7 * rs).toFixed(0)}" gradientUnits="userSpaceOnUse"><stop offset="${(sh / (7.7 * rs)).toFixed(2)}" stop-color="#fff3d6"/><stop offset=".5" stop-color="#f5a524" stop-opacity=".7"/><stop offset="1" stop-color="#f5a524" stop-opacity="0"/></radialGradient>
<radialGradient id="bh-disk" cx="${o.x}" cy="${o.y}" r="${(9 * rs).toFixed(0)}" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 ${o.y}) scale(1 0.16) translate(0 ${-o.y})"><stop offset=".29" stop-color="#fff8e8"/><stop offset=".55" stop-color="#f5a524" stop-opacity=".8"/><stop offset="1" stop-color="#f5a524" stop-opacity="0"/></radialGradient>
<clipPath id="bh-top"><rect x="0" y="0" width="${W}" height="${o.y}"/></clipPath><clipPath id="bh-bottom"><rect x="0" y="${o.y}" width="${W}" height="${H}"/></clipPath></defs>
<circle cx="${o.x}" cy="${o.y}" r="${(7.7 * rs).toFixed(0)}" fill="url(#bh-arc)" clip-path="url(#bh-top)"/>
<circle cx="${o.x}" cy="${o.y}" r="${sh.toFixed(0)}" fill="#000"/>
<circle cx="${o.x}" cy="${o.y}" r="${(sh + 1).toFixed(0)}" fill="none" stroke="#fff3d6" stroke-width="2"/>
<ellipse cx="${o.x}" cy="${o.y}" rx="${(9 * rs).toFixed(0)}" ry="${(9 * rs * 0.16).toFixed(0)}" fill="url(#bh-disk)" clip-path="url(#bh-bottom)"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><g stroke="#f5a524" stroke-opacity=".22" stroke-width="1">${lines}</g>${dots}${nodeDots}${hole}</svg>`;
}
