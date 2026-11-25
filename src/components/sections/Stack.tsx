import { getTranslations } from "next-intl/server";

import { SectionHead } from "@/components/SectionHead";
import { StackStage } from "@/components/stack/StackStage";
import { stackTokens } from "@/content/profile";
import { STACK_ICONS } from "@/lib/stack-icons";

/*
 * 02 · STACK. Canvas 3D (carregado só perto da seção) com os logos como
 * fichas físicas. Tudo que é conteúdo vem daqui (servidor): o grid estático
 * (fallback e acesso por teclado) e o dialog com os detalhes de cada peça.
 */
export async function Stack() {
  const tr = await getTranslations("stack");
  const tn = await getTranslations("nav");
  const tokens = stackTokens.map(({ id, name }) => ({ id, name }));

  return (
    <section id="stack" data-stack aria-labelledby="stack-title" className="bg-paper text-ink">
      <SectionHead n="02" label={tn("stack")} title={tr("title")} id="stack-title" meta={tr("meta", { count: stackTokens.length })}>
        {tr("lede")} <span className="text-ink-soft">{tr("hint")}</span>
      </SectionHead>

      <div className="stack-box">
        {/* fallback estático (sem JS, reduced-motion, aparelho fraco, sem WebGL);
            com o 3D ativo vira uma lista que só aparece com foco de teclado */}
        <ul className="stack-grid" aria-label={tr("list")}>
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
          <button type="button" className="stack-close" aria-label={tr("close")}>
            <span aria-hidden="true">×</span>
          </button>
          {stackTokens.map((t) => {
            return (
              <div key={t.id} data-panel={t.id} hidden>
                <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">Stack · {t.id}</p>
                <h3 id={`tech-${t.id}`} className="mt-3 font-display text-4xl leading-none tracking-tight sm:text-5xl">
                  {t.name}
                </h3>
                <p className="mt-4 text-[17px] leading-relaxed">{tr(`tokens.${t.id}`)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
