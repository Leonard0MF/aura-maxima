"use client";

import { useSyncExternalStore } from "react";

export type Mode = "terminal" | "clean";

const STORAGE_KEY = "recon:mode";
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getMode(): Mode {
  return document.documentElement.dataset.mode === "clean" ? "clean" : "terminal";
}

function setMode(mode: Mode) {
  document.documentElement.dataset.mode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage indisponível (aba privada, bloqueado): só não persiste */
  }
  listeners.forEach((l) => l());
}

const options: { value: Mode; label: string }[] = [
  { value: "terminal", label: "terminal" },
  { value: "clean", label: "clean" },
];

export function ModeToggle({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const mode = useSyncExternalStore(subscribe, getMode, () => "terminal" as Mode);

  return (
    <div
      role="group"
      aria-label="Modo de exibição"
      className={`flex rounded-md border p-0.5 font-mono text-[11px] normal-case sm:text-xs ${
        tone === "light" ? "border-ink/15 bg-paper/70 backdrop-blur" : "border-line bg-surface"
      }`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={mode === o.value}
          onClick={() => setMode(o.value)}
          className={`min-h-9 rounded px-2.5 py-1.5 transition-colors duration-150 sm:px-3 ${
            tone === "light"
              ? "text-ink-soft hover:text-ink aria-pressed:bg-ink aria-pressed:text-paper"
              : "text-muted hover:text-fg aria-pressed:bg-bg aria-pressed:text-accent"
          }`}
        >
          <span className="max-sm:hidden">Modo </span>
          {o.label}
        </button>
      ))}
    </div>
  );
}
