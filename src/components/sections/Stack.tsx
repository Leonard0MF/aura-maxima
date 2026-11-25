import Link from "next/link";

import { Decrypt } from "@/components/Decrypt";
import { Dual } from "@/components/Dual";
import { StackStage } from "@/components/stack/StackStage";
import { projects, stackTokens } from "@/content/profile";
import { STACK_ICONS } from "@/lib/stack-icons";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/*
 * 02 · STACK. Canvas 3D (carregado só perto da seção) com os logos como
 * fichas físicas. Tudo que é conteúdo é renderizado aqui no servidor: o grid
 * estático (fallback), o índice de nomes e os painéis "usado em".
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
          <span className="text-ink-soft">
            <Dual term="nmap -sV --top-ports stack" clean="Tecnologias" />
          </span>
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
        {/* fallback estático: sem JS, reduced-motion, aparelho fraco, sem WebGL */}
        <ul className="stack-grid" aria-label="Tecnologias">
          {stackTokens.map((t) => {
            const icon = STACK_ICONS[t.id];
            return (
              <li key={t.id}>
                <button type="button" data-tech={t.id} aria-pressed="false" className="stack-cell">
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
      </div>

      <div className="px-4 pb-20 sm:px-6 sm:pb-28">
        <div className="grid gap-6 border-t border-ink/20 pt-4 lg:grid-cols-12">
          <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs lg:col-span-3">Índice</p>
          <ul className="stack-index flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs tracking-wide uppercase lg:col-span-9">
            {stackTokens.map((t) => (
              <li key={t.id}>
                <button type="button" data-tech={t.id} aria-pressed="false" className="ulink min-h-6">
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div aria-live="polite" className="mt-6 grid gap-6 border-t border-ink/20 pt-4 lg:grid-cols-12">
          <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs lg:col-span-3">Usado em</p>
          <div className="lg:col-span-9">
            <p data-panel="" className="text-ink-soft">
              Clique numa peça (ou num nome do índice) para ver os projetos que usam a tecnologia.
            </p>
            {stackTokens.map((t) => {
              const list = usedBy(t);
              return (
                <div key={t.id} data-panel={t.id} hidden>
                  {list.length ? (
                    <p className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                      <span className="font-display text-3xl tracking-tight sm:text-4xl">{t.name}</span>
                      {list.map((p) => (
                        <Link key={p.slug} href={`/projetos/${p.slug}`} className="ulink font-mono text-xs tracking-wide uppercase">
                          {p.display} <span aria-hidden="true">→</span>
                        </Link>
                      ))}
                    </p>
                  ) : (
                    <p>
                      <span className="font-display text-3xl tracking-tight sm:text-4xl">{t.name}</span>
                      <span className="mt-2 block text-ink-soft">Nenhum projeto publicado aqui usa {t.name} ainda.</span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
