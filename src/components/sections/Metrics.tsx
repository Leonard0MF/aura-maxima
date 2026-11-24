import { Dual } from "@/components/Dual";
import { metrics } from "@/content/profile";
import { t } from "@/lib/i18n";

/* Faixa larga, de borda a borda: quebra o ritmo entre findings e histórico. */
export function Metrics() {
  return (
    <section aria-labelledby="metricas" className="my-8 border-y border-line bg-surface/60">
      <div className="mx-auto max-w-[75rem] px-4 py-10 sm:px-6">
        <h2 id="metricas" className="mb-6 font-mono text-xs text-dim">
          <Dual term={<><span className="text-accent">$</span> recon --stats --since 2026-10</>} clean="Impacto em números" />
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-line lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={t(m.label)} className="flex flex-col-reverse gap-2 bg-bg p-5 sm:p-6">
              <dt className="text-sm text-muted">{t(m.label)}</dt>
              <dd className={`font-mono text-4xl font-bold tracking-tight sm:text-5xl ${m.value === "TODO" ? "text-dim" : "text-fg"}`}>
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
