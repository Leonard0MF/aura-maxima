import Link from "next/link";

import { Decrypt } from "@/components/Decrypt";
import { StackStage } from "@/components/stack/StackStage";
import { projects, stackTokens } from "@/content/profile";
import { STACK_ICONS } from "@/lib/stack-icons";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/*
 * 02 · STACK. Canvas 3D (carregado só perto da seção) com os logos como
 * fichas físicas. Tudo que é conteúdo vem daqui (servidor): o grid estático
 * (fallback e acesso por teclado) e o dialog com os detalhes de cada peça.
 */
export function Stack() {
  const usedBy = (t: (typeof stackTokens)[number]) => {
    const names = (t.match ?? [t.name]).map(norm);
    return projects.filter((p) => p.stack.some((s) => names.includes(norm(s))));
  };
  const tokens = stackTokens.map(({ id, name }) => ({ id, name }));

  return (
    <section id="stack" data-stack aria-labelledby="stack-title" className="bg-paper text-ink">
      <header className="sec-head">
        <div className="sec-meta">
          <span>02</span>
          <span className="text-ink-soft">ls ~/stack</span>
          <span>{stackTokens.length} tecnologias</span>
        </div>
        <h2 id="stack-title" className="sec-title font-display">
          <Decrypt text="STACK" />
        </h2>
        <p className="mt-8 max-w-[36ch] text-xl leading-snug sm:text-2xl">
          As ferramentas com que eu construo e testo. <span className="text-ink-soft">Arraste, arremesse, clique numa peça.</span>
        </p>
      </header>

      <div className="stack-box">
        {/* fallback estático (sem JS, reduced-motion, aparelho fraco, sem WebGL);
            com o 3D ativo vira uma lista que só aparece com foco de teclado */}
        <ul className="stack-grid" aria-label="Tecnologias">
          {stackTokens.map((t) => {
            const icon = STACK_ICONS[t.id];
            return (
              <li key={t.id}>
                <button type="button" data-tech={t.id} aria-haspopup="dialog" className="stack-cell">
                  {icon && (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={icon.path} />
                    </svg>
                  )}
                  <span>{t.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <StackStage tokens={tokens} />
        <div className="stack-tip" hidden aria-hidden="true" />

        <div className="stack-dialog" role="dialog" aria-modal="true" hidden>
          <button type="button" className="stack-close" aria-label="Fechar">
            <span aria-hidden="true">×</span>
          </button>
          {stackTokens.map((t) => {
            const list = usedBy(t);
            return (
              <div key={t.id} data-panel={t.id} hidden>
                <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">Stack · {t.id}</p>
                <h3 id={`tech-${t.id}`} className="mt-3 font-display text-4xl leading-none tracking-tight sm:text-5xl">
                  {t.name}
                </h3>
                <p className="mt-4 text-[17px] leading-relaxed">{t.use}</p>
                <div className="mt-6 border-t border-ink/20 pt-3 font-mono text-xs tracking-wide uppercase">
                  <p className="text-ink-soft">Usado em</p>
                  {list.length ? (
                    <ul className="mt-2 space-y-1">
                      {list.map((p) => (
                        <li key={p.slug}>
                          <Link href={`/projetos/${p.slug}`} className="ulink">
                            {p.display} <span aria-hidden="true">→</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 normal-case">Ainda sem projeto publicado aqui com {t.name}.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
