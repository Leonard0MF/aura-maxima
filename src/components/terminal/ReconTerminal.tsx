"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { completions, lineText, run } from "./commands";
import type { Line, TerminalData, Tone } from "./types";

const SEEN_KEY = "recon:scan-seen";

const tone: Record<Tone, string> = {
  fg: "text-fg",
  muted: "text-muted",
  dim: "text-dim",
  accent: "text-accent",
  ok: "text-ok",
  err: "text-red-300",
};

type Entry = { id: number; cmd: string; out: Line[] };

const CHIPS = [
  { label: "whoami", cmd: "whoami" },
  { label: "projects", cmd: "ls projects" },
  { label: "contact", cmd: "contact" },
  { label: "help", cmd: "help" },
];

function Prompt() {
  return (
    <span aria-hidden="true" className="shrink-0 whitespace-pre select-none">
      <span className="text-ok">leo@recon</span>
      <span className="text-dim">:</span>
      <span className="text-accent">~</span>
      <span className="text-dim">$ </span>
    </span>
  );
}

function Out({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className="min-h-[1lh] break-words whitespace-pre-wrap">
          {line.map((seg, j) => {
            const cls = tone[seg.tone ?? "muted"];
            if (!seg.href) return <span key={j} className={cls}>{seg.t}</span>;
            const linkCls = `${cls} underline decoration-current/40 underline-offset-4 hover:decoration-current`;
            if (seg.internal)
              return (
                <Link key={j} href={seg.href} className={linkCls}>
                  {seg.t}
                </Link>
              );
            const ext = /^https?:/.test(seg.href);
            return (
              <a
                key={j}
                href={seg.href}
                className={linkCls}
                {...(seg.download ? { download: "" } : {})}
                {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {seg.t}
                {ext ? <span className="sr-only"> (abre em nova aba)</span> : null}
              </a>
            );
          })}
        </div>
      ))}
    </>
  );
}

/*
 * Terminal do hero. O scan inicial é HTML estático animado só com CSS
 * (aparece antes da hidratação e não depende de JS); depois disso o
 * prompt fica interativo.
 */
export function ReconTerminal({ data }: { data: TerminalData }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cleared, setCleared] = useState(false);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* sem storage: o scan só toca de novo na próxima visita */
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  function execute(cmd: string) {
    const res = run(cmd, data, history);
    const trimmed = cmd.trim();
    if (trimmed) setHistory((h) => [...h, trimmed]);
    setCursor(null);
    setValue("");
    if (res.clear) {
      setEntries([]);
      setCleared(true);
      setAnnounce("Tela limpa.");
      return;
    }
    setEntries((e) => [...e, { id: nextId.current++, cmd: trimmed, out: res.out }]);
    setAnnounce(lineText(res.out));
    if (res.download) {
      const a = document.createElement("a");
      a.href = res.download;
      a.download = "";
      a.click();
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      execute(value);
    } else if (e.key === "ArrowUp") {
      if (!history.length) return;
      e.preventDefault();
      const i = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
      setCursor(i);
      setValue(history[i]);
    } else if (e.key === "ArrowDown") {
      if (cursor === null) return;
      e.preventDefault();
      const i = cursor + 1;
      if (i >= history.length) {
        setCursor(null);
        setValue("");
      } else {
        setCursor(i);
        setValue(history[i]);
      }
    } else if (e.key === "Tab" && value.trim()) {
      /* Só intercepta Tab com texto digitado: com o campo vazio, Tab segue
         navegando pela página (não prende quem usa teclado). */
      e.preventDefault();
      const v = value.trimStart().toLowerCase();
      const matches = completions(data).filter((c) => c.startsWith(v));
      if (matches.length === 1) setValue(matches[0]);
      else if (matches.length > 1) {
        /* completa até o prefixo comum (ex.: "ca" → "cat ") e lista as opções */
        let prefix = matches[0];
        for (const mt of matches) while (!mt.startsWith(prefix)) prefix = prefix.slice(0, -1);
        if (prefix.length > v.length) setValue(prefix);
        setEntries((en) => [...en, { id: nextId.current++, cmd: value, out: [[{ t: matches.join("   "), tone: "dim" }]] }]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      execute("clear");
    }
  }

  function focusInput() {
    if (window.getSelection()?.toString()) return;
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="term flex h-[340px] focus-within:border-accent/60 flex-col overflow-hidden rounded-xl border border-line bg-[#090b0e] shadow-[0_24px_80px_-24px_rgb(0_0_0/0.8)] lg:h-[480px]">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-3.5">
          <span aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
            <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
            <span className="size-2.5 rounded-full bg-[#28c840]/80" />
          </span>
          <span className="flex-1 text-center font-mono text-[11px] text-dim">leo@recon: ~ — zsh</span>
          <span aria-hidden="true" className="w-[42px]" />
        </div>

        <div
          ref={scrollRef}
          onClick={focusInput}
          className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[1.7] sm:text-[13px]"
        >
          {!cleared ? (
            <div aria-hidden="true">
              <div className="text-fg">
                <span className="text-accent">$</span> recon --target &quot;{data.name}&quot;
              </div>
              {data.scan.map((l, i) => (
                <div key={l.label} className="scan-line flex gap-1 text-muted" style={{ "--i": i + 1 } as React.CSSProperties}>
                  <span className="text-accent">[+]</span>
                  <span className="shrink-0">{l.label}</span>
                  <span className="scan-dots" />
                  <span className="shrink-0 text-fg">{l.result}</span>
                </div>
              ))}
              <div className="scan-line text-ok" style={{ "--i": data.scan.length + 1 } as React.CSSProperties}>
                [✓] report ready · digite <span className="text-accent">help</span> ou use os atalhos abaixo
              </div>
            </div>
          ) : null}

          {entries.map((e) => (
            <div key={e.id} className="mt-2">
              <div className="flex">
                <Prompt />
                <span className="text-fg">{e.cmd}</span>
              </div>
              <Out lines={e.out} />
            </div>
          ))}

          <div className="scan-line mt-2 flex items-center" style={{ "--i": data.scan.length + 2 } as React.CSSProperties}>
            <Prompt />
            <span className="relative min-w-0 flex-1">
            <label htmlFor="term-input" className="sr-only">
              Comando do terminal (digite help para ver os comandos)
            </label>
            <input
              ref={inputRef}
              id="term-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              placeholder=" "
              className="term-input w-full bg-transparent text-fg caret-accent outline-none"
            />
            <span aria-hidden="true" className="term-cursor pointer-events-none absolute inset-y-0 left-0" />
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Atalhos do terminal">
        <span className="font-mono text-[11px] text-dim">atalhos:</span>
        {CHIPS.map((c) => (
          <button
            key={c.cmd}
            type="button"
            onClick={() => execute(c.cmd)}
            className="min-h-9 rounded-md border border-line bg-surface px-3 font-mono text-xs text-muted transition-colors duration-150 hover:border-accent hover:text-fg"
          >
            {c.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="sr-only">
        {announce}
      </div>
    </div>
  );
}
