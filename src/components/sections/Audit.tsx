import { AuditField } from "@/components/audit/AuditField";
import { SectionHead } from "@/components/SectionHead";
import { audit, auditDate, auditGrade, auditNodes, auditScore } from "@/content/audit";
import { profile } from "@/content/profile";

/*
 * 03 · AUDIT: "este site, visto por dentro". Fundo escuro (fade preso à
 * seção) com uma constelação interativa (AuditField) cujos nós principais
 * são dados REAIS de segurança do site, vindos de content/audit.json. Por
 * cima, em DOM: cabeçalho, frase, nota, trade-off do CSP e o CTA do Aegis.
 * A seção cabe em 100svh.
 */
export function Audit() {
  const meta = "font-mono text-[11px] tracking-wide uppercase sm:text-xs";
  return (
    <section id="auditoria" aria-labelledby="audit-title" className="audit theme-dark">
      <div className="audit-bg" aria-hidden="true" />
      <AuditField nodes={auditNodes} grade={auditGrade} score={auditScore} example={audit.example} />

      <div className="audit-body text-fg">
        <SectionHead n="03" label="Audit" title="Por dentro" id="audit-title" meta={`aegis · ${audit.target}`}>
          <span className="text-muted">Este site, visto por dentro. Passe o mouse nos pontos que brilham.</span>
        </SectionHead>

        <div className="audit-foot px-4 sm:px-6">
          <div className="max-w-[62ch]">
            <p className={`${meta} text-muted`}>
              Nota{" "}
              <span className="ml-1 text-paper">
                {auditGrade ? `${auditGrade} · ${auditScore ?? "—"}/100` : "—"}
              </span>
              <span className="ml-3 text-dim">
                {audit.example ? "dados de exemplo · sem nota" : `resultado real gerado pelo Aegis em ${auditDate ?? "—"}`}
              </span>
            </p>
            <p className="mt-3 text-sm text-muted">
              <sup className="text-accent">*</sup> Trade-off consciente: CSP sem nonce para manter o site estático e rápido; a superfície de XSS é mínima (sem
              inputs que virem HTML).
            </p>
            <p className="mt-4">
              <a href={profile.aegisUrl} target="_blank" rel="noopener noreferrer" className="audit-cta">
                Escaneie o site da sua empresa no Aegis <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </p>
            <p className={`audit-hint mt-4 ${meta} text-dim`}>arraste para girar · clique no vazio para escanear</p>
          </div>

          {/* os dados em texto: visíveis no fallback, sempre lidos por leitores de tela */}
          <dl className="audit-list font-mono text-[11px] sm:text-xs">
            {auditNodes.map((n) => (
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
