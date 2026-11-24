import Link from "next/link";

export default function NotFound() {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 font-mono">
      <p className="text-sm text-dim">
        <span className="text-accent">$</span> curl -I {"<path>"}
      </p>
      <h1 className="mt-3 text-2xl text-fg">404 · nada exposto aqui</h1>
      <p className="mt-2 text-muted">A página que você procura não existe.</p>
      <Link href="/" className="mt-8 text-sm text-accent hover:underline">
        ← voltar ao relatório
      </Link>
    </main>
  );
}
