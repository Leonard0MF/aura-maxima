import { Decrypt } from "@/components/Decrypt";
import { SectionHead } from "@/components/SectionHead";
import { activity, metrics, services } from "@/content/profile";
import { t } from "@/lib/i18n";

const isTodo = (s: string) => s.trim().startsWith("TODO");

/*
 * 04 · ABOUT (cabe em 100svh): frase de posicionamento, métricas reais (as
 * TODO somem), experiência em tabela editorial e a stack como índice de texto.
 */
export function About() {
  const real = metrics.filter((m) => !isTodo(m.value));
  return (
    <section id="about" aria-labelledby="about-title" className="bg-paper text-ink">
      <SectionHead n="04" label="About" title="Sobre" id="about-title" meta="whoami">
        Dev full-stack com foco em segurança. Brasil.
      </SectionHead>

      <div className="sec-end px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <p className="max-w-[20ch] text-[clamp(1.75rem,3vw,2.75rem)] leading-[1.08] font-medium tracking-tight">
              <Decrypt text="Construo aplicações web de ponta a ponta — e depois tento quebrá-las." />
            </p>
            {/* métricas: com menos de 2 números reais, o bloco some (sem TODO na tela) */}
            {real.length >= 2 && (
              <dl className="mt-6 flex gap-8 border-t border-ink/20 pt-4">
                {real.map((m) => (
                  <div key={t(m.label)} className="flex flex-col-reverse">
                    <dt className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{t(m.label)}</dt>
                    <dd className="font-display text-5xl leading-none">{m.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="lg:col-span-7">
            <h3 className="font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs">Experiência</h3>
            <table className="mt-2 w-full border-t border-ink/20 text-left text-[15px]">
              <thead className="hidden font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:table-header-group">
                <tr className="border-b border-ink/20">
                  <th className="py-2 pr-5 font-normal">Período</th>
                  <th className="py-2 pr-5 font-normal">Empresa</th>
                  <th className="py-2 pr-5 font-normal">Papel</th>
                  <th className="py-2 font-normal">O que faço</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => {
                  const period = t(a.period);
                  const bullets = a.bullets.map((b) => t(b)).filter((b) => !isTodo(b));
                  return (
                    <tr key={a.org} className="grid border-b border-ink/20 py-3 align-top sm:table-row sm:py-0">
                      <td className="font-mono text-xs whitespace-nowrap uppercase sm:py-3 sm:pr-5">
                        {isTodo(period) ? "—" : period}
                        {a.current && (
                          <>
                            <span className="ml-2 inline-block size-1.5 rounded-full bg-accent align-middle" aria-hidden="true" />
                            <span className="sr-only"> (atual)</span>
                          </>
                        )}
                      </td>
                      <td className="font-display text-xl whitespace-nowrap sm:py-3 sm:pr-5">{a.org}</td>
                      <td className="text-ink-soft sm:py-3 sm:pr-5">{t(a.role)}</td>
                      <td className="leading-snug sm:py-3">{bullets.length ? bullets.join(" · ") : <span className="text-ink-soft">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <h3 className="mt-8 font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs">Stack</h3>
        <div className="mt-2 grid gap-x-8 gap-y-4 border-t border-ink/20 pt-3 sm:grid-cols-3 lg:grid-cols-5">
          {services.map((g) => (
            <div key={g.id}>
              <h4 className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{t(g.title.clean)}</h4>
              <p className="mt-1.5 font-mono text-[13px] leading-relaxed">{g.items.join(" · ")}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
