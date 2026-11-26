import { getTranslations } from "next-intl/server";

import { SectionHead } from "@/components/SectionHead";
import { StackStage } from "@/components/stack/StackStage";
import { stackCoins, stackCoinsMobile, stackCount, stackIndex, stackLevel, type StackItem } from "@/content/profile";
import { STACK_ICONS } from "@/lib/stack-icons";

/*
 * 02 · STACK. Canvas 3D à esquerda (~60%) com as moedas e o índice compacto
 * à direita (~40%), por categoria; no celular, canvas em cima e índice
 * embaixo. Tudo que é conteúdo vem daqui (servidor): o índice (que é também
 * a lista acessível), o grid de logos do modo estático e o dialog de cada
 * moeda. A interação índice ↔ 3D fica no StackStage.
 */
export async function Stack() {
  const tr = await getTranslations("stack");
  const tn = await getTranslations("nav");
  const coinIds = new Set(stackCoins.map((c) => c.id));
  const itemName = (it: StackItem) => it.name ?? tr(`items.${it.id}`);
  const levelTag = (id: string) => {
    const l = stackLevel(id);
    return l ? tr(`levels.${l}`) : null;
  };
  /* moedas por categoria (para o destaque no 3D) */
  const catCoins = Object.fromEntries(stackIndex.map((c) => [c.id, c.items.map((i) => i.id).filter((id) => coinIds.has(id))]));

  return (
    <section id="stack" data-stack aria-labelledby="stack-title" className="bg-paper text-ink">
      <SectionHead n="02" label={tn("stack")} title={tr("title")} id="stack-title" meta={tr("meta", { count: stackCount })}>
        {tr("lede")} <span className="text-ink-soft">{tr("hint")}</span>
      </SectionHead>

      <div className="stack-layout">
        <div className="stack-box">
          {/* modo estático (reduced-motion, aparelho fraco, sem WebGL): os logos
              em grid no lugar do canvas. Para leitores de tela e teclado, o
              índice ao lado já é a lista; o grid é só visual. */}
          <ul className="stack-grid" aria-hidden="true">
            {stackCoins.map((t) => {
              const icon = STACK_ICONS[t.id];
              return (
                <li key={t.id}>
                  <button type="button" tabIndex={-1} data-tech={t.id} data-cell className="stack-cell">
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
          <StackStage tokens={stackCoins} mobile={stackCoinsMobile} cats={catCoins} />
          <div className="stack-tip" hidden aria-hidden="true" />

          <div className="stack-dialog" role="dialog" aria-modal="true" hidden>
            <button type="button" className="stack-close" aria-label={tr("close")}>
              <span aria-hidden="true">×</span>
            </button>
            {stackCoins.map((t) => {
              const lvl = levelTag(t.id);
              return (
                <div key={t.id} data-panel={t.id} hidden>
                  <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">
                    Stack · {t.id}
                    {lvl && (
                      <span className="stack-lvl ml-3">
                        <span className="sr-only">{tr("levelLabel")}: </span>
                        {lvl}
                      </span>
                    )}
                  </p>
                  <h3 id={`tech-${t.id}`} className="mt-3 font-display text-4xl leading-none tracking-tight sm:text-5xl">
                    {t.name}
                  </h3>
                  <p className="mt-4 text-[17px] leading-relaxed">{tr(`tokens.${t.id}`)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <nav className="stack-index" aria-label={tr("index")}>
          <p className="stack-legend">
            {(["practice", "familiar", "contact"] as const).map((l) => (
              <span key={l}>
                <span className="stack-lvl">{tr(`levels.${l}`)}</span> {tr(`levelsHelp.${l}`)}
              </span>
            ))}
          </p>
          <p className="sr-only">{tr("filterHint")}</p>
          {stackIndex.map((c, i) => (
            <div key={c.id} className="stack-cat" data-cat={c.id}>
              <h3 className="stack-cat__head">
                <button type="button" className="stack-cat__btn" data-cat-btn={c.id} aria-pressed="false" disabled={!catCoins[c.id].length || undefined}>
                  <span className="stack-cat__n" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="stack-cat__name">{tr(`cats.${c.id}`)}</span>
                  <span className="stack-cat__count" aria-hidden="true">
                    {c.items.length}
                  </span>
                </button>
              </h3>
              <ul className="stack-cat__items">
                {c.items.map((it) => {
                  const lvl = it.level ? tr(`levels.${it.level}`) : null;
                  const label = (
                    <>
                      {itemName(it)}
                      {lvl && (
                        <span className="stack-lvl">
                          <span className="sr-only"> · {tr("levelLabel")}: </span>
                          {lvl}
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li key={it.id}>
                      {coinIds.has(it.id) ? (
                        <button type="button" className="stack-item stack-item--coin" data-tech={it.id} aria-haspopup="dialog">
                          {label}
                        </button>
                      ) : (
                        <span className="stack-item">{label}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </section>
  );
}
