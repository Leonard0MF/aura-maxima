import { Dual } from "@/components/Dual";
import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { audit, type CheckStatus } from "@/content/audit";
import { profile } from "@/content/profile";

const statusUi: Record<CheckStatus, { label: string; cls: string; icon: string }> = {
  pass: { label: "ok", cls: "text-ok", icon: "✓" },
  warn: { label: "atenção", cls: "text-accent", icon: "!" },
  fail: { label: "falha", cls: "text-red-300", icon: "✕" },
  unknown: { label: "pendente", cls: "text-dim", icon: "?" },
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function Audit() {
  const passed = audit.headers.filter((h) => h.status === "pass").length;
  const checked = fmtDate(audit.checkedAt);
  const expires = fmtDate(audit.tls.expiresAt);

  return (
    <section aria-labelledby="auditoria" className="mx-auto max-w-[75rem] px-4 py-14 sm:px-6">
      <SectionHeading id="auditoria" index="Segurança" command={`aegis scan ${audit.target}`} title="Auditoria deste site" />
      <Reveal>
        <article className="overflow-hidden rounded-xl border border-line bg-surface">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 font-mono text-xs text-dim sm:px-8">
            <span>
              <Dual term="REPORT" clean="Relatório" /> · {audit.target}
            </span>
            <span>
              {audit.tool}
              {audit.toolVersion ? ` ${audit.toolVersion}` : ""} · {checked ? `verificado em ${checked}` : "verificação pendente"}
            </span>
          </header>

          <div className="grid lg:grid-cols-[18rem_1fr]">
            {/* Nota */}
            <div className="flex flex-col justify-center gap-2 border-b border-line p-6 sm:p-8 lg:border-r lg:border-b-0">
              <p className="font-mono text-xs text-dim">
                <Dual term="SECURITY GRADE" clean="Nota de segurança" />
              </p>
              <p className={`font-mono text-7xl leading-none font-bold tracking-tight ${audit.grade ? "text-fg" : "text-dim"}`}>
                {audit.grade ?? "—"}
              </p>
              <p className="font-mono text-sm text-muted">
                {audit.score !== null ? `${audit.score}/100` : "nota pendente: roda após o deploy"}
              </p>
              <p className="mt-2 font-mono text-xs text-dim">
                {passed}/{audit.headers.length} headers ok
              </p>
            </div>

            {/* Checklist */}
            <div className="p-6 sm:p-8">
              <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                {audit.headers.map((h) => {
                  const ui = statusUi[h.status];
                  return (
                    <li key={h.id} className="flex gap-3">
                      <span aria-hidden="true" className={`mt-0.5 font-mono text-sm font-bold ${ui.cls}`}>
                        [{ui.icon}]
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-fg">
                          {h.label} <span className={`text-xs ${ui.cls}`}>· {ui.label}</span>
                        </p>
                        <p className="text-sm break-words text-muted">{h.detail}</p>
                      </div>
                    </li>
                  );
                })}
                <li className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 font-mono text-sm font-bold ${audit.tls.valid === null ? "text-dim" : audit.tls.valid ? "text-ok" : "text-red-300"}`}
                  >
                    [{audit.tls.valid === null ? "?" : audit.tls.valid ? "✓" : "✕"}]
                  </span>
                  <div>
                    <p className="font-mono text-sm text-fg">
                      Certificado TLS{" "}
                      <span className="text-xs text-dim">
                        · {audit.tls.valid === null ? "pendente" : audit.tls.valid ? "válido" : "inválido"}
                      </span>
                    </p>
                    <p className="text-sm text-muted">
                      {audit.tls.valid === null
                        ? "Verificado após o deploy no domínio final."
                        : [audit.tls.protocol, audit.tls.issuer, expires ? `expira em ${expires}` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </li>
              </ul>

              <p className="mt-6 border-l-2 border-accent/60 pl-4 text-sm text-muted">
                <span className="font-medium text-fg">Trade-off consciente:</span> CSP sem nonce para manter o site
                estático e rápido; superfície de XSS mínima (sem input de usuário).
              </p>

              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm">
                <a
                  href={`https://securityheaders.com/?q=${encodeURIComponent(audit.target)}&followRedirects=on`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                >
                  Verificar no securityheaders.com<span className="sr-only"> (abre em nova aba)</span>
                </a>
                <a
                  href={profile.aegisUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted underline decoration-line underline-offset-4 hover:text-accent"
                >
                  Conheça o Aegis<span className="sr-only"> (abre em nova aba)</span>
                </a>
              </div>
            </div>
          </div>
          <p className="border-t border-line px-5 py-2.5 font-mono text-[11px] text-dim sm:px-8">fonte: {audit.source}</p>
        </article>
      </Reveal>
    </section>
  );
}
