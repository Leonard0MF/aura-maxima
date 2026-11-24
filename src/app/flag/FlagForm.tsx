"use client";

import { useState, type FormEvent } from "react";

import { profile } from "@/content/profile";

/*
 * Validação no client de propósito: não é segredo real, só um jogo.
 * Guardamos os hashes SHA-256 para as flags não aparecerem em texto puro.
 */
const HASHES = [
  { hint: "Abra o DevTools.", hash: "4f8554ea06faa7b43145302cc0df5ac30f9aa8fd944261641911730b6fc90468" },
  { hint: "Olhe os headers da resposta.", hash: "e23a557a97ed95af82201a6281e60554a53ff6b2ad0213e492e4daad00c10bd0" },
  { hint: "O que os robôs não devem ver?", hash: "70bf49a29377e9e1882cede699d15878b5838c2b9a48b83f5b1f3e830acaf14d" },
];

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim()));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function FlagForm() {
  const [status, setStatus] = useState<"idle" | "wrong" | "ok">("idle");
  const [wrong, setWrong] = useState<number[]>([]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const results = await Promise.all(HASHES.map(async (h, i) => (await sha256(String(data.get(`flag${i}`) ?? ""))) === h.hash));
    const bad = results.flatMap((ok, i) => (ok ? [] : [i]));
    setWrong(bad);
    setStatus(bad.length === 0 ? "ok" : "wrong");
  }

  if (status === "ok") {
    const { contact } = profile;
    return (
      <section aria-live="polite" className="mt-10 rounded-lg border border-accent/50 bg-accent-soft p-6">
        <p className="font-mono text-sm text-ok">[✓] 3/3 flags · access granted</p>
        <h2 className="mt-3 text-2xl font-semibold text-fg">Você acharia bugs no meu time também. Vamos conversar?</h2>
        <ul className="mt-6 space-y-2 font-mono text-sm">
          <li>
            <a href={`mailto:${contact.email}`} className="text-accent underline underline-offset-4">
              {contact.email}
            </a>
          </li>
          <li>
            <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
              LinkedIn<span className="sr-only"> (abre em nova aba)</span>
            </a>
          </li>
          <li>
            <a href={contact.github} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-4">
              GitHub<span className="sr-only"> (abre em nova aba)</span>
            </a>
          </li>
        </ul>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-5" noValidate>
      {HASHES.map((h, i) => {
        const invalid = status === "wrong" && wrong.includes(i);
        return (
          <div key={h.hash}>
            <label htmlFor={`flag${i}`} className="font-mono text-sm text-fg">
              Flag {i + 1}
            </label>
            <p id={`flag${i}-hint`} className="text-sm text-dim">
              Dica: {h.hint}
            </p>
            <input
              id={`flag${i}`}
              name={`flag${i}`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="LEO{...}"
              aria-describedby={`flag${i}-hint`}
              aria-invalid={invalid || undefined}
              className={`mt-2 w-full rounded-md border bg-surface px-3 py-2.5 font-mono text-sm text-fg placeholder:text-dim ${
                invalid ? "border-red-400" : "border-line"
              }`}
            />
          </div>
        );
      })}
      <button type="submit" className="min-h-11 rounded-md bg-accent px-5 font-mono text-sm font-medium text-bg hover:bg-accent/90">
        Enviar
      </button>
      <p aria-live="polite" className="font-mono text-sm text-red-300">
        {status === "wrong" ? `[x] ${wrong.length} flag(s) incorreta(s).` : ""}
      </p>
    </form>
  );
}
