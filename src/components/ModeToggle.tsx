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
  { value: "terminal", label: "Modo terminal" },
  { value: "clean", label: "Modo clean" },
];

export function ModeToggle() {
  const mode = useSyncExternalStore(subscribe, getMode, () => "terminal" as Mode);

  return (
    <div
      role="group"
      aria-label="Modo de exibição"
      className="flex rounded-md border border-line bg-surface p-0.5 font-mono text-[11px] sm:text-xs"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={mode === o.value}
          onClick={() => setMode(o.value)}
          className="min-h-9 rounded px-2.5 py-1.5 text-muted transition-colors duration-150 hover:text-fg aria-pressed:bg-bg aria-pressed:text-accent sm:px-3"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
