"use client";

import { useEffect, useRef, useState } from "react";

import { audit, auditGrade, auditScore, type CheckStatus } from "@/content/audit";
import { landDots, project } from "@/lib/worldmap";

const STATUS: Record<CheckStatus, { label: string; cls: string; mark: string }> = {
  pass: { label: "ok", cls: "text-[#8fd6a8]", mark: "✓" },
  warn: { label: "atenção", cls: "text-accent", mark: "!" },
  fail: { label: "falha", cls: "text-[#ff8a80]", mark: "✕" },
  info: { label: "info", cls: "text-muted", mark: "i" },
};

/* linha do tempo do replay (~6 s) */
const T_START = 500;
const T_STEP = 700;
const T_STAMP = T_START + audit.categories.length * T_STEP + 400;

type Phase = "idle" | "running" | "done";

/*
 * Replay de um scan do Aegis (dados de audit.json). Nada é escaneado de
 * verdade aqui: é a reprodução animada de um resultado já gerado.
 * Reduced-motion: o resultado aparece direto, sem animação.
 */
export function AuditReplay() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState(0); // categorias já marcadas
  const [stamp, setStamp] = useState(false);
  const timers = useRef<number[]>([]);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const pingRef = useRef(0); // 0..1: servidores marcados no mapa
  const total = audit.categories.length;

  const finish = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setShown(total);
    setStamp(true);
    setPhase("done");
    pingRef.current = 1;
    drawMap(1);
  };

  const run = () => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
    timers.current.forEach(clearTimeout);
    setShown(0);
    setStamp(false);
    setPhase("running");
    pingRef.current = 0;
    animateMap();
    timers.current = [
      ...audit.categories.map((_, i) => window.setTimeout(() => setShown(i + 1), T_START + (i + 1) * T_STEP)),
      window.setTimeout(() => {
        setStamp(true);
        setPhase("done");
      }, T_STAMP),
    ];
  };

  /* ---------- mini-mapa (Canvas 2D) ---------- */
  const dots = useRef<[number, number][] | null>(null);
  function drawMap(ping: number, t = 0) {
    const c = mapRef.current;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    dots.current ??= landDots(4);
    const r = Math.max(1, w / 260);
    ctx.fillStyle = "#3a4048";
    for (const [lon, lat] of dots.current) {
      const p = project(lon, lat, w, h);
      ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
    }
    if (ping <= 0) return;
    for (const s of audit.servers) {
      const p = project(s.lon, s.lat, w, h);
      /* onda que se expande enquanto o scan roda */
      if (ping < 1) {
        const k = (t % 1200) / 1200;
        ctx.strokeStyle = `rgba(245,165,36,${(1 - k) * 0.8})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 + k * 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#f5a524";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const raf = useRef(0);
  function animateMap() {
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const loop = (now: number) => {
      const t = now - t0;
      pingRef.current = t > 800 ? (t > T_STAMP ? 1 : 0.5) : 0;
      drawMap(pingRef.current, t);
      if (t < T_STAMP + 100) raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tm = timers.current;
    /* reduced-motion: mostra o resultado direto */
    const id = window.setTimeout(() => (reduce ? finish() : drawMap(pingRef.current)), 0);
    const ro = new ResizeObserver(() => drawMap(pingRef.current));
    if (mapRef.current) ro.observe(mapRef.current);
    return () => {
      clearTimeout(id);
      ro.disconnect();
      tm.forEach(clearTimeout);
      cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montagem única
  }, []);

  const date = audit.scannedAt ? new Date(audit.scannedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
  const pct = phase === "idle" ? 0 : Math.round((shown / total) * 100);

  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-12">
      {/* esquerda: botão + categorias */}
      <div className="lg:col-span-7">
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={run} disabled={phase === "running"} className="audit-btn">
            {phase === "idle" ? "Escanear este site" : phase === "running" ? "Escaneando…" : "Escanear de novo"}
          </button>
          <p className="font-mono text-xs text-dim" aria-live="polite">
            {phase === "idle" ? `alvo: ${audit.target}` : phase === "running" ? `aegis scan ${audit.target} · ${pct}%` : `scan completo · ${total}/${total} categorias`}
          </p>
        </div>
        <ol className="mt-4 border-t border-line font-mono text-xs sm:text-[13px]">
          {audit.categories.map((c, i) => {
            const done = i < shown;
            const active = phase === "running" && i === shown;
            const st = STATUS[c.status];
            return (
              <li key={c.id} className={`audit-row ${done ? "is-done" : ""}`}>
                <span className={`w-28 shrink-0 whitespace-nowrap uppercase ${done ? st.cls : "text-dim"}`}>
                  {done ? `[${st.mark}] ${st.label}` : active ? "[…]" : "[ ]"}
                </span>
                <span className="w-32 shrink-0 text-paper">{c.label}</span>
                <span className={`min-w-0 truncate ${done ? "text-muted" : "text-dim/60"}`}>{done ? c.summary : active ? "verificando…" : "—"}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* direita: mapa + nota */}
      <div className="relative lg:col-span-5">
        <p className="font-mono text-[11px] tracking-wide text-dim uppercase">Servidores</p>
        <canvas ref={mapRef} className="mt-2 block aspect-[2.3/1] w-full" aria-hidden="true" />
        <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-muted">
          {audit.servers.map((s) => (
            <li key={s.ip} className={phase === "idle" ? "opacity-0" : "opacity-100 transition-opacity duration-500"}>
              <span className="text-accent">●</span> {s.city}, {s.country} · {s.ip}
              {s.provider ? ` · ${s.provider}` : ""}
            </li>
          ))}
        </ul>
        {stamp && (
          <div className="audit-stamp" role="status">
            {auditGrade ? (
              <>
                <span className="font-display text-[clamp(5rem,9vw,8rem)] leading-none">{auditGrade}</span>
                <span className="font-mono text-xs">{auditScore}/100</span>
              </>
            ) : (
              <span className="font-mono text-xs leading-snug uppercase">
                Dados de exemplo
                <br />
                sem nota
              </span>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-muted lg:col-span-12">
        {audit.example ? (
          <>
            <b className="text-accent">Exemplo.</b> Estes dados são ilustrativos; o resultado real do Aegis sobre este domínio entra aqui depois do deploy.
          </>
        ) : (
          <>Resultado real gerado pelo Aegis em {date ?? "—"}.</>
        )}{" "}
        <sup className="text-accent">*</sup> Trade-off consciente: CSP sem nonce para manter o site estático e rápido; a superfície de XSS é mínima (sem
        inputs que virem HTML).
      </p>
    </div>
  );
}
