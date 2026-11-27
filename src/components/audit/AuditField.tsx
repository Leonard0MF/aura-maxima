"use client";

import { useEffect, useRef, useState } from "react";

import type { AuditNode, CheckStatus } from "@/content/audit";
import { claimGL, schedule as nudgeGL } from "@/lib/gl-slot";
import { prewarm } from "@/lib/prewarm";

import { auditDebug, note, probe } from "./diag";
import type { Layout, Rect } from "./layout";
import type { Constellation } from "./scene";

const idle = () => new Promise<void>((r) => ("requestIdleCallback" in window ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));

/* posições das partículas: geradas uma vez (num Worker, buffers
 * transferidos; sem Worker, na main thread em pedaços de 300 partículas, um
 * por idle) e reaproveitadas a cada nova montagem */
const layouts = new Map<string, Promise<Layout>>();
function getLayout(n: number, count: number) {
  const key = `${n}:${count}`;
  let p = layouts.get(key);
  if (!p) {
    const local = (why: string) =>
      import("./layout").then((m) => {
        note("layout", `main thread em pedaços (${why})`);
        return m.makeLayoutChunked(n, count, idle);
      });
    p = new Promise<Layout>((res) => {
      if (typeof Worker === "undefined") return void local("sem Worker").then(res);
      try {
        const w = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent<Layout>) => {
          note("layout", `Worker (${count} partículas)`);
          res(e.data);
          w.terminate();
        };
        w.onerror = () => {
          w.terminate();
          void local("Worker falhou").then(res);
        };
        w.postMessage({ n, count });
      } catch {
        void local("Worker indisponível").then(res);
      }
    });
    layouts.set(key, p);
  }
  return p;
}

const STATUS: Record<CheckStatus, string> = {
  pass: "bg-[#8fd6a8]",
  warn: "bg-accent",
  fail: "bg-[#ff8a80]",
  info: "bg-[#a3acb6]",
};

/* textos do servidor (messages: audit.*); progress/done usam {lit} e {total} */
export type AuditLabels = { status: Record<string, string>; progress: string; done: string; close: string };
const fill = (s: string, v: Record<string, number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/*
 * Camada interativa do AUDIT: buraco negro + constelação (WebGL) atrás do
 * texto da seção.
 * - hover/toque num nó brilhante: cartão com o dado
 * - arrastar: gira o sistema em volta do buraco negro (o scroll vertical nunca
 *   é capturado: touch-action pan-y, nenhum listener de wheel). No toque, o
 *   gesto só é nosso se começar horizontal (pan-y deixa o vertical para a
 *   página) ou sobre um nó (touchstart com preventDefault só nesse caso)
 * - toque (pointer: coarse): sem efeito de cursor na cena; no celular o
 *   cartão é um bottom sheet com botão de fechar (tocar fora ou rolar fecha)
 * - clique no vazio: onda de scan saindo do horizonte; os nós acendem em
 *   sequência e a nota aparece grande ao lado
 * Celular e máquinas fracas: versão simplificada (sem o pass de lente) e,
 * em aparelho fraco, menos partículas (mínimo 600) — o nível mais baixo
 * NUNCA desliga a constelação; os nós continuam visíveis.
 * Fallback (reduced-motion, sem WebGL2, erro de shader, contexto perdido
 * duas vezes): imagem estática da mesma cena + os nós como lista tocável
 * no celular (a lista em texto sempre existe para leitores de tela).
 * Diagnóstico em aparelho real: ?auditdebug (diag.ts).
 */
export function AuditField({ nodes, labels }: { nodes: AuditNode[]; labels: AuditLabels }) {
  const ref = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState(-1);
  const [lit, setLit] = useState<number[]>([]);
  const [reveal, setReveal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [tap, setTap] = useState(-1); // modo estático: nó aberto na lista tocável
  const sceneRef = useRef<Constellation | null>(null);
  const cardIdx = useRef(-1);
  const closeCard = useRef<() => void>(() => {});

  useEffect(() => {
    const field = ref.current!;
    const section = field.closest("section")!;
    const cap = probe(); // os contextos de teste são liberados na hora
    /* caixas de texto da seção por cima do campo (px do campo): o sistema
     * (nós e poeira) não as invade. No celular o campo já é só a faixa livre */
    const keepOut = (): Rect[] => {
      const f = field.getBoundingClientRect();
      return [...section.querySelectorAll(".sh-label, .sh-title, .sh-lede, .audit-copy, .audit-list")]
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 2 && r.height > 2 && r.bottom > f.top && r.top < f.bottom && r.right > f.left && r.left < f.right)
        .map((r) => ({ x: r.left - f.left, y: r.top - f.top, w: r.width, h: r.height }));
    };
    let isStatic = false;
    let lay: typeof import("./layout") | null = null;
    const drawStatic = () => lay && setSvg(staticSvg(lay, nodes.length, field.clientWidth, field.clientHeight, keepOut()));
    const ro = new ResizeObserver(() => (isStatic ? drawStatic() : sceneRef.current?.setKeepOut(keepOut())));
    ro.observe(section);
    /* os textos mudam de lugar sem a seção mudar de tamanho (modo estático,
     * fontes): observa também o rodapé e a lista */
    section.querySelectorAll(".audit-foot, .audit-list, .sh").forEach((e) => ro.observe(e));
    const fallback = (why: string) => {
      note("fallback", `imagem estática + lista (${why})`);
      section.dataset.static = "";
      isStatic = true;
      /* mede depois de o layout do modo estático (data-static) assentar */
      void import("./layout").then((m) => {
        lay = m;
        requestAnimationFrame(() => requestAnimationFrame(drawStatic));
      });
    };
    /* só reduced-motion (escolha do usuário) ou falta de WebGL2 viram imagem
     * estática. O data-fx="static" do boot (≤ 4 núcleos) vale para o hero; a
     * constelação roda nesses aparelhos, só mais leve. O three.js (r163+) não
     * suporta WebGL1: aí a versão simplificada é a imagem + lista */
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      fallback("reduced-motion");
      return;
    }
    if (!cap.webgl2) {
      fallback(cap.webgl1 ? "só WebGL1" : "sem WebGL");
      return;
    }

    const mobile = matchMedia("(max-width: 639px)").matches;
    /* sem o pass de lente: celular/toque (no resto, lib/gpu-perf decide) */
    const simple = mobile || matchMedia("(pointer: coarse)").matches;
    /* aparelho fraco: menos partículas, nunca menos de 600 */
    const weak = (cap.cores > 0 && cap.cores <= 4) || (cap.mem > 0 && cap.mem <= 2);
    let scene: Constellation | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let want = false; // o contexto deve existir (lib/gl-slot)
    let active = false; // esta seção é a que renderiza
    let pending: Promise<void> | null = null;
    let follow = 0;
    let ready = false; // nível de qualidade escolhido: pode renderizar
    let chooseGo: (() => void) | null = null;
    let chooseStop: (() => void) | null = null;

    /* durante o círculo da 1ª entrada (AuditReveal) o loop fica parado: só
     * liga quando a seção está coberta (data-done) */
    const opened = () => "done" in section.dataset || !document.documentElement.dataset.reveal;
    let liveSent = false;
    const sync = () => {
      const on = ready && active && opened() && !document.hidden;
      scene?.run(on);
      /* 1º quadro desenhado (o rAF da cena roda antes deste): avisa o AuditReveal */
      if (on && !liveSent) {
        liveSent = true;
        requestAnimationFrame(() => requestAnimationFrame(() => section.dispatchEvent(new Event("audit:live"))));
      }
    };
    /* qualidade: escolhida meia viewport ANTES do campo aparecer (ou na hora,
     * se a seção já precisa renderizar), num idle, com tudo o que a STACK
     * mediu até ali. A cena já ajusta o buffer e desenha um quadro nesse
     * nível: a entrada não realoca nada */
    const chooseWhenNear = (s: Constellation) => {
      const check = () => {
        const r = field.getBoundingClientRect();
        const gap = r.top > innerHeight ? r.top - innerHeight : r.bottom < 0 ? -r.bottom : 0;
        if (gap <= innerHeight * 0.5) idleGo();
        else if (active) go();
      };
      const stop = () => {
        removeEventListener("scroll", check);
        chooseGo = chooseStop = null;
      };
      const go = () => {
        stop();
        if (scene !== s) return;
        const r = s.choose();
        note("qualidade", `${r.quality} · ${r.why}`);
        ready = true;
        sync();
      };
      let idleId = 0;
      const idleGo = () => {
        if (idleId) return;
        idleId = 1;
        void idle().then(() => chooseGo === go && go());
      };
      chooseGo = go;
      chooseStop = stop;
      addEventListener("scroll", check, { passive: true });
      check();
    };
    /* preparação em pedaços: código e layout em paralelo (o layout num
     * Worker), contexto num idle, shaders e aquecimento em outros (warm).
     * Termina com o loop PARADO; quem liga é o gl-slot. */
    const count = weak ? 600 : mobile ? 1500 : 4500;
    note("partículas", `${count}${weak ? " (aparelho fraco)" : ""} · ${simple ? "simple (sem lente)" : "lente (nível decidido perto da seção)"}`);
    let losses = 0;
    let dead = false; // caiu na imagem estática: não monta mais
    const mount = async (): Promise<void> => {
      if (scene || dead) return;
      const [{ createConstellation }, layout] = await Promise.all([import("./scene"), getLayout(Math.min(nodes.length, 12), count)]);
      await idle();
      if (!want || scene || dead) return;
      const c = document.createElement("canvas");
      c.className = "audit-canvas";
      c.setAttribute("aria-hidden", "true");
      let made: Constellation;
      try {
        made = createConstellation(c, nodes.length, {
          count,
          simple,
          layout: layout.n === Math.min(nodes.length, 12) ? layout : undefined,
          keep: keepOut(),
          /* contexto perdido (no celular: app em segundo plano, memória):
           * a 1ª vez recria; a 2ª vira imagem estática */
          onLost: () => {
            losses++;
            note("contexto perdido", `${losses}×`);
            unmount();
            if (losses >= 2) {
              dead = true;
              fallback("contexto WebGL perdido 2×");
            } else
              setTimeout(() => {
                if (want && !scene && !pending) pending = mount().finally(() => (pending = null));
              }, 600);
          },
        });
      } catch (e) {
        dead = true;
        fallback(`erro ao criar o WebGL: ${(e as Error)?.message || e}`);
        return;
      }
      field.prepend(c);
      try {
        await made.warm();
      } catch (e) {
        made.destroy();
        c.remove();
        dead = true;
        fallback((e as Error)?.message || String(e));
        return;
      }
      if (!want) {
        made.destroy();
        c.remove();
        return;
      }
      canvas = c;
      scene = made;
      sceneRef.current = scene;
      /* testes automatizados (?auditdebug) */
      if (auditDebug()) (window as unknown as { __audit?: Constellation }).__audit = scene;
      section.dataset.live = "";
      note("campo", `${field.clientWidth}×${field.clientHeight} px · canvas ${c.width}×${c.height}`);
      chooseWhenNear(made);
    };
    const unmount = () => {
      chooseStop?.();
      ready = false;
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
    /* lib/gl-slot: nasce PARADA cedo — quando o usuário chega ao WORK, bem
     * antes da STACK (desktop; no celular, a ~0,6 viewport) — para os shaders
     * compilarem em idle longe do AUDIT. Renderiza só quando é a vez desta
     * seção (prioridade depois que a revelação começou). Depois de criada,
     * NUNCA é liberada (persist): fora da tela o loop só pausa; ao voltar,
     * retoma sem recompilar nem regenerar nada. */
    const work = document.getElementById("findings");
    const early = () => {
      if (mobile || !work) return false;
      const vh = innerHeight;
      const f = field.getBoundingClientRect();
      return f.top > vh && work.getBoundingClientRect().top < vh; // AUDIT abaixo e o WORK já na tela (ou passou)
    };
    const stopPrewarm = prewarm(() => Promise.all([import("./scene"), getLayout(Math.min(nodes.length, 12), count)]));
    const release = claimGL({
      prepareAt: 0.6,
      persist: true, // criada uma vez por página: fora da tela só pausa
      keep: early,
      el: field,
      prepare() {
        want = true;
        pending = mount().finally(() => (pending = null));
        return pending;
      },
      async release() {
        want = false;
        active = false;
        await pending;
        unmount();
      },
      run(on) {
        active = on;
        if (on) chooseGo?.();
        sync();
      },
      priority: () => ("in" in section.dataset ? 1 : 0),
    });

    /* AuditReveal: data-in (o círculo começou: prioridade de render) e
     * data-done (seção coberta: o loop pode ligar) */
    const mo = new MutationObserver(() => {
      nudgeGL();
      sync();
    });
    mo.observe(section, { attributes: true, attributeFilter: ["data-in", "data-done"] });
    document.addEventListener("visibilitychange", sync);

    /* ---------- interação ---------- */
    const pos = (e: PointerEvent) => {
      const r = field.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    /* celular: o cartão é um bottom sheet fixo (não segue o nó) */
    const sheet = matchMedia("(max-width: 639px)");
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
      if (sheet.matches) {
        el.style.transform = "";
        el.style.visibility = "visible";
        return;
      }
      const p = scene.nodeAt(i);
      const w = field.clientWidth;
      /* ao lado do nó (direita, senão esquerda) e sempre dentro do campo */
      const side = p.x + 18 + el.offsetWidth > w - 12 ? p.x - 18 - el.offsetWidth : p.x + 18;
      const left = Math.max(12, Math.min(w - el.offsetWidth - 12, side));
      const top = Math.max(8, Math.min(field.clientHeight - el.offsetHeight - 8, p.y - el.offsetHeight / 2));
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      el.style.visibility = "visible";
      follow = requestAnimationFrame(place);
    };
    let openY = 0;
    const show = (i: number) => {
      if (cardIdx.current === i) return;
      cardIdx.current = i;
      openY = scrollY;
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
      if (e.pointerType === "mouse") {
        scene.pointer(p.x, p.y, true); // efeito de cursor: só com mouse
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
      if (wasDrag) {
        scene.release();
        return;
      }
      const p = pos(e);
      const i = scene.hit(p.x, p.y);
      if (i >= 0) {
        show(cardIdx.current === i && e.pointerType !== "mouse" ? -1 : i); // toque: abre/fecha
        return;
      }
      /* toque no vazio com um cartão aberto: só fecha (não escaneia) */
      if (e.pointerType !== "mouse" && cardIdx.current >= 0) {
        show(-1);
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
      scene?.release();
      scene?.pointer(0, 0, false);
    };
    /* toque que começa num nó é nosso (sem rolar a página); fora dele, o
     * navegador decide: vertical rola, horizontal vira arrasto (pan-y) */
    const onTouch = (e: TouchEvent) => {
      if (!scene || e.touches.length !== 1) return;
      const r = field.getBoundingClientRect();
      const t = e.touches[0];
      if (scene.hit(t.clientX - r.left, t.clientY - r.top) >= 0) e.preventDefault();
    };
    /* bottom sheet: tocar fora fecha; rolar a página também */
    const onDocDown = (e: PointerEvent) => {
      if (cardIdx.current < 0 || !sheet.matches) return;
      const t = e.target as Node;
      if (cardRef.current?.contains(t) || field.contains(t)) return;
      show(-1);
    };
    const onScroll = () => {
      if (cardIdx.current >= 0 && sheet.matches && Math.abs(scrollY - openY) > 40) show(-1);
    };
    closeCard.current = () => show(-1);
    field.addEventListener("touchstart", onTouch, { passive: false });
    document.addEventListener("pointerdown", onDocDown);
    addEventListener("scroll", onScroll, { passive: true });
    field.addEventListener("pointermove", onMove);
    field.addEventListener("pointerdown", onDown);
    field.addEventListener("pointerup", onUp);
    field.addEventListener("pointerleave", onLeave);
    field.addEventListener("pointercancel", onCancel);

    return () => {
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", sync);
      field.removeEventListener("touchstart", onTouch);
      document.removeEventListener("pointerdown", onDocDown);
      removeEventListener("scroll", onScroll);
      field.removeEventListener("pointermove", onMove);
      field.removeEventListener("pointerdown", onDown);
      field.removeEventListener("pointerup", onUp);
      field.removeEventListener("pointerleave", onLeave);
      field.removeEventListener("pointercancel", onCancel);
      stopPrewarm();
      release();
      unmount();
      delete section.dataset.static;
    };
  }, [nodes]);

  const node = card >= 0 ? nodes[card] : null;

  return (
    <div ref={ref} className="audit-field">
      {svg && <div className="audit-static" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />}
      {/* modo estático no celular: os nós como cartões tocáveis sobre a imagem
          (no desktop, a lista em texto do rodapé) */}
      {svg && (
        <ul className="audit-taps font-mono">
          {nodes.map((n, i) => (
            <li key={n.id}>
              <button type="button" className="audit-tap" aria-expanded={tap === i} aria-controls={`audit-tap-${n.id}`} onClick={() => setTap(tap === i ? -1 : i)}>
                <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${STATUS[n.status]}`} />
                <span className="min-w-0 flex-1 truncate">{n.label}</span>
                <span className="sr-only">{labels.status[n.status]}</span>
                <span aria-hidden="true" className="text-dim">{tap === i ? "−" : "+"}</span>
              </button>
              <p id={`audit-tap-${n.id}`} hidden={tap !== i} className="audit-tap__value">
                {n.value}
              </p>
            </li>
          ))}
        </ul>
      )}

      {node && (
        <div ref={cardRef} className="audit-card" role="status">
          <button type="button" className="audit-card__close" aria-label={labels.close} onClick={() => closeCard.current()}>
            <span aria-hidden="true">×</span>
          </button>
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

    </div>
  );
}

/* imagem estática: o mesmo sistema em repouso (buraco negro + anel + nós),
 * em SVG, no tamanho do campo e com as mesmas caixas de texto evitadas */
function staticSvg(lay: typeof import("./layout"), n: number, fw: number, fh: number, keep: Rect[]) {
  const { makeLayout, region, DUST_TILT } = lay;
  const W = Math.max(320, Math.round(fw)), H = Math.max(240, Math.round(fh));
  const L = makeLayout(n, 1400);
  const R = region(W, H, keep, n);
  const { hc } = R;
  const homes = R.homes;
  const sq = Math.cos(DUST_TILT); // o anel visto inclinado
  const spread = 0.38 * R.rin * 0.55;
  const g = (k: number) => Math.sin(k * 12.9898) * 43758.5453 % 1; // desvio determinístico
  let dots = "";
  for (let i = 0; i < L.count; i++) {
    const [px, py, pz] = L.points.subarray(i * 3, i * 3 + 3);
    const [kind, a, b, t] = L.ref.subarray(i * 4, i * 4 + 4);
    let x: number, y: number;
    if (kind === 0) {
      x = homes[a].x + px * spread;
      y = homes[a].y + py * spread;
    } else if (kind === 1) {
      x = homes[a].x + (homes[b].x - homes[a].x) * t + px * spread;
      y = homes[a].y + (homes[b].y - homes[a].y) * t + py * spread;
    } else {
      const u = kind === 2 ? px : px * (1 - Math.abs(g(i)));
      const rr = R.rin + (R.rout - R.rin) * u;
      x = hc.x + Math.cos(py) * rr;
      y = hc.y - Math.sin(py) * rr * sq + pz * rr * 0.3;
    }
    /* nunca sobre o disco nem sobre um texto (o mesmo corte do shader) */
    if (((x - hc.x) / R.ex) ** 2 + ((y - hc.y) / R.ey) ** 2 < 1.2 || keep.some((k) => x > k.x - 8 && x < k.x + k.w + 8 && y > k.y - 8 && y < k.y + k.h + 8)) continue;
    const col = L.tones[i] > 0.5 ? "#f5a524" : "#ece9e0";
    dots += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(L.sizes[i] * 1.1).toFixed(1)}" fill="${col}" fill-opacity="${L.tones[i] > 0.5 ? 0.55 : 0.4}"/>`;
  }
  const lines = L.pairs
    .filter(([a, b]) => Math.hypot((homes[a].x + homes[b].x) / 2 - hc.x, (homes[a].y + homes[b].y) / 2 - hc.y) > R.rin * 0.9)
    .map(([a, b]) => `<line x1="${homes[a].x.toFixed(0)}" y1="${homes[a].y.toFixed(0)}" x2="${homes[b].x.toFixed(0)}" y2="${homes[b].y.toFixed(0)}"/>`)
    .join("");
  const nodeDots = homes
    .map((p) => `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="14" fill="#f5a524" fill-opacity=".18"/><circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="4" fill="#fff3d6"/>`)
    .join("");
  /* buraco negro: arco de trás (imagem curvada do disco), horizonte, anel de fótons, frente do disco */
  const o = { x: hc.x, y: hc.y };
  const rs = hc.rs;
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
