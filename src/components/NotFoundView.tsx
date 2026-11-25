import Link from "next/link";

/* corpo do 404 (o mesmo no 404 por idioma e no global) */
export function NotFoundView({ title, body, back, home }: { title: string; body: string; back: string; home: string }) {
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 font-mono">
      <p className="text-sm text-dim">
        <span className="text-accent">$</span> curl -I {"<path>"}
      </p>
      <h1 className="mt-3 text-2xl text-fg">{title}</h1>
      <p className="mt-2 text-muted">{body}</p>
      <Link href={home} className="mt-8 text-sm text-accent hover:underline">
        ← {back}
      </Link>
    </main>
  );
}
