import { AuditField } from "@/components/audit/AuditField";
import { SectionHead } from "@/components/SectionHead";
import { getLocale, getTranslations } from "next-intl/server";

import { audit, auditGrade, auditScore } from "@/content/audit";
import { profile } from "@/content/profile";
import { auditView } from "@/lib/site";

/*
 * 03 · AUDIT: "este site, visto por dentro". Fundo escuro (fade preso à
 * seção) com um buraco negro no terço esquerdo e uma constelação interativa
 * em órbita (AuditField) cujos nós principais são os dados de segurança do
 * site, vindos de content/audit.json. Por cima, em DOM: cabeçalho, frase,
 * nota, trade-off do CSP e o CTA do Aegis (à direita no desktop, para não
 * cobrir o buraco negro). A seção cabe em 100svh.
 */
export async function Audit() {
  const locale = await getLocale();
  const t = await getTranslations("audit");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const { nodes, date } = await auditView(locale);
  const labels = {
    status: t.raw("status") as Record<string, string>,
    progress: t.raw("progress") as string,
    done: t.raw("done") as string,
    gradeExample: t("gradeExample"),
    gradePending: t("gradePending"),
  };
  const meta = "font-mono text-[11px] tracking-wide uppercase sm:text-xs";
  return (
    <section id="auditoria" aria-labelledby="audit-title" className="audit theme-dark">
      <div className="audit-bg" aria-hidden="true" />
      <AuditField nodes={nodes} grade={auditGrade} score={auditScore} example={audit.example} labels={labels} />

      <div className="audit-body text-fg">
        <SectionHead n="03" label={tn("audit")} title={t("title")} id="audit-title" meta={`aegis · ${audit.target}`}>
          <span className="text-muted">{t("lede")}</span>
        </SectionHead>

        <div className="audit-foot px-4 sm:px-6">
          <div className="audit-copy max-w-[62ch]">
            <p className={`${meta} text-muted`}>
              {t("grade")}{" "}
              <span className="ml-1 text-paper">
                {auditGrade ? `${auditGrade} · ${auditScore ?? "—"}/100` : "—"}
              </span>
              <span className="ml-3 text-dim">
                {audit.example ? t("example") : t("real", { date: date ?? "—" })}
              </span>
            </p>
            <p className="mt-3 text-sm text-muted">
              <sup className="text-accent">*</sup> {t("tradeoff")}
            </p>
            <p className="mt-4">
              <a href={profile.aegisUrl} target="_blank" rel="noopener noreferrer" className="audit-cta">
                {t("cta")} <span aria-hidden="true">↗</span>
                <span className="sr-only">{tc("newTab")}</span>
              </a>
            </p>
            <p className={`audit-hint mt-4 ${meta} text-dim`}>{t("hint")}</p>
          </div>

          {/* os dados em texto: visíveis no fallback, sempre lidos por leitores de tela */}
          <dl className="audit-list font-mono text-[11px] sm:text-xs">
            {nodes.map((n) => (
              <div key={n.id} className="flex gap-3 border-b border-line py-1.5">
                <dt className="w-44 shrink-0 text-muted uppercase">{n.label}</dt>
                <dd className="min-w-0 text-paper">{n.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
