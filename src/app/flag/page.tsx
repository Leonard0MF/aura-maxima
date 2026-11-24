import type { Metadata } from "next";

import { FlagForm } from "./FlagForm";

export const metadata: Metadata = {
  title: "/flag",
  description: "Envie as três flags.",
  robots: { index: false, follow: false },
};

export default function FlagPage() {
  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-2xl px-4 py-16 sm:py-24">
      <p className="font-mono text-sm text-dim">
        <span className="text-accent">$</span> submit --flags 3
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">Capture the flag</h1>
      <p className="mt-3 text-muted">
        Há três flags no formato <code className="font-mono text-accent">LEO{"{...}"}</code> escondidas neste site. Achou as três?
      </p>
      <FlagForm />
    </main>
  );
}
