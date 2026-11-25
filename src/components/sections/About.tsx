import { Decrypt } from "@/components/Decrypt";
import { activity, metrics, services } from "@/content/profile";
import { t } from "@/lib/i18n";

const isTodo = (s: string) => s.trim().startsWith("TODO");

/*
 * 05 · ABOUT: frase grande, métricas (só as reais), experiência em tabela
 * editorial e a stack como índice de texto. Sem caixas.
 */
export function About() {
  const real = metrics.filter((m) => !isTodo(m.value));
  return (
    <section id="about" aria-labelledby="about-title" className="bg-paper text-ink">
      <header className="sec-head">
        <div className="sec-meta">
          <span>05</span>
          <span className="text-ink-soft">whoami --verbose</span>
          <span>Brasil</span>
        </div>
        <h2 id="about-title" className="sec-title font-display">
          <Decrypt text="ABOUT" />
        </h2>
      </header>

      <div className="px-4 pb-20 sm:px-6 sm:pb-28">
        <p className="max-w-[22ch] text-[clamp(2rem,5vw,4rem)] leading-[1.05] font-medium tracking-tight">
          <Decrypt text="Construo aplicações web de ponta a ponta — e depois tento quebrá-las." />
        </p>

        {/* métricas: com menos de 2 números reais, o bloco some (sem TODO na tela) */}
        {real.length >= 2 && (
          <dl className="mt-16 grid border-y border-ink/20 sm:grid-flow-col sm:divide-x sm:divide-ink/20">
            {real.map((m) => (
              <div key={t(m.label)} className="py-6 sm:px-6 sm:first:pl-0">
                <dt className="order-2 font-mono text-[11px] tracking-wide text-ink-soft uppercase">{t(m.label)}</dt>
                <dd className="font-display text-[clamp(3.5rem,8vw,7rem)] leading-none">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}

        <h3 className="mt-20 font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs">Experiência</h3>
        <table className="mt-4 w-full border-t border-ink/20 text-left">
          <thead className="hidden font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:table-header-group">
            <tr className="border-b border-ink/20">
              <th className="py-3 pr-6 font-normal">Período</th>
              <th className="py-3 pr-6 font-normal">Empresa</th>
              <th className="py-3 pr-6 font-normal">Papel</th>
              <th className="py-3 font-normal">O que faço</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a) => {
              const period = t(a.period);
              const bullets = a.bullets.map((b) => t(b)).filter((b) => !isTodo(b));
              return (
                <tr key={a.org} className="grid border-b border-ink/20 py-4 align-top sm:table-row sm:py-0">
                  <td className="font-mono text-xs uppercase sm:py-5 sm:pr-6">
                    {isTodo(period) ? "—" : period}
                    {a.current && (
                      <>
                        <span className="ml-2 inline-block size-1.5 rounded-full bg-accent align-middle" aria-hidden="true" />
                        <span className="sr-only"> (atual)</span>
                      </>
                    )}
                  </td>
                  <td className="font-display text-2xl tracking-tight sm:py-5 sm:pr-6">{a.org}</td>
                  <td className="text-ink-soft sm:py-5 sm:pr-6">{t(a.role)}</td>
                  <td className="sm:py-5">{bullets.length ? bullets.join(" · ") : <span className="text-ink-soft">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h3 className="mt-20 font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs">Stack</h3>
        <div className="mt-4 grid gap-x-8 gap-y-8 border-t border-ink/20 pt-6 sm:grid-cols-3 lg:grid-cols-5">
          {services.map((g) => (
            <div key={g.id}>
              <h4 className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{t(g.title.clean)}</h4>
              <ul className="mt-3 space-y-1 font-mono text-sm">
                {g.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
