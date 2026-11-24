import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { activity } from "@/content/profile";
import { t } from "@/lib/i18n";

export function Activity() {
  return (
    <section aria-labelledby="historico" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading
        id="historico"
        index="03 · Experiência"
        command="tail -n 20 activity.log"
        title="Histórico de atividade"
      />
      <ol className="relative max-w-3xl border-l border-line">
        {activity.map((a) => (
          <li key={a.org} className="relative pb-12 pl-6 last:pb-0 sm:pl-8">
            <span
              aria-hidden="true"
              className={`absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-bg ${a.current ? "bg-accent" : "bg-dim"}`}
            />
            <Reveal>
              <p className="font-mono text-xs text-dim">{t(a.period)}</p>
              <h3 className="mt-1 text-lg font-semibold text-fg">
                {a.org} <span className="font-normal text-muted">· {t(a.role)}</span>
              </h3>
              <ul className="mt-3 space-y-1.5 text-muted">
                {a.bullets.map((b) => (
                  <li key={t(b)} className="flex gap-3">
                    <span aria-hidden="true" className="font-mono text-dim">
                      <span className="t-term">&gt;</span>
                      <span className="t-clean">–</span>
                    </span>
                    {t(b)}
                  </li>
                ))}
              </ul>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
