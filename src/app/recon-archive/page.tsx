import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "recon-archive",
  robots: { index: false, follow: false },
};

/* CTF · flag 3 de 3. Quem lê o robots.txt chega aqui. */
export default function ReconArchive() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 font-mono">
      <p className="text-sm text-dim">
        <span className="text-accent">$</span> cat /recon-archive/README
      </p>
      <h1 className="mt-3 text-2xl text-fg">Disallow não é controle de acesso.</h1>
      <p className="mt-4 text-muted">
        Flag 3/3: <code className="text-accent">LEO{"{robots_txt_is_a_map}"}</code>
      </p>
      <Link href="/flag" className="mt-8 text-sm text-accent hover:underline">
        Enviar flags →
      </Link>
    </main>
  );
}
