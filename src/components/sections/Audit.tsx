import { Decrypt } from "@/components/Decrypt";
import { audit, type CheckStatus } from "@/content/audit";
import { profile } from "@/content/profile";

const ui: Record<CheckStatus, { label: string; cls: string }> = {
  pass: { label: "ok", cls: "text-[#8fd6a8]" },
  warn: { label: "atenção", cls: "text-accent" },
  fail: { label: "falha", cls: "text-[#ff8a80]" },
  unknown: { label: "pendente", cls: "text-dim" },
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/*
 * 04 · AUDIT: a única seção escura. O fundo é um círculo (do tamanho da lente)
 * que cresce com a rolagem até cobrir a tela e fecha na saída: CSS
 * scroll-driven animation (transform: scale, sem JS). Sem suporte ou com
 * reduced-motion: corte seco. NUNCA inflar a nota: vem de audit.json.
 */
export function Audit() {
  const passed = audit.headers.filter((h) => h.status === "pass").length;
  const checked = fmtDate(audit.checkedAt);
  const tls = audit.tls;

  return (
    <section id="auditoria" aria-labelledby="audit-title" className="audit theme-dark">
      <div className="audit-bg" aria-hidden="true">
        <div className="audit-pin">
          <span />
        </div>
      </div>
      <div className="audit-body text-fg">
        <header className="sec-head" style={{ borderTop: 0 }}>
          <div className="sec-meta">
            <span>04</span>
            <span className="text-dim">
              aegis scan {audit.target} · {checked ?? "verificação pendente"}
            </span>
            <span>
              {passed}/{audit.headers.length} headers ok
            </span>
          </div>
          <h2 id="audit-title" className="sec-title font-display text-paper">
            <Decrypt text="AUDIT" />
          </h2>
        </header>

        <div className="grid gap-10 px-4 pb-10 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <p className="font-mono text-[11px] tracking-wide text-dim uppercase sm:text-xs">Nota de segurança</p>
            <p className="font-display leading-[0.8] text-paper" style={{ fontSize: "clamp(9rem, 26vw, 22rem)" }}>
              {audit.grade ?? (
                <span className="audit-dash" role="img" aria-label="Nota pendente">
                  <span aria-hidden="true">—</span>
                </span>
              )}
            </p>
            <p className="mt-4 font-mono text-sm text-muted">
              {audit.score !== null ? `${audit.score}/100` : "Nota pendente: o Aegis roda depois do deploy no domínio final."}
            </p>
          </div>

          <div className="lg:col-span-8">
            <ul className="border-t border-line font-mono text-xs sm:text-sm">
              {audit.headers.map((h) => (
                <li key={h.id} className="grid gap-x-6 gap-y-1 border-b border-line py-3 sm:grid-cols-[6rem_14rem_1fr]">
                  <span className={`${ui[h.status].cls} uppercase`}>[{ui[h.status].label}]</span>
                  <span className="text-paper">{h.label}</span>
                  <span className="break-words text-muted">{h.detail}</span>
                </li>
              ))}
              <li className="grid gap-x-6 gap-y-1 border-b border-line py-3 sm:grid-cols-[6rem_14rem_1fr]">
                <span className={`${tls.valid === null ? ui.unknown.cls : tls.valid ? ui.pass.cls : ui.fail.cls} uppercase`}>
                  [{tls.valid === null ? "pendente" : tls.valid ? "ok" : "falha"}]
                </span>
                <span className="text-paper">Certificado TLS</span>
                <span className="text-muted">
                  {tls.valid === null
                    ? "Verificado depois do deploy no domínio final."
                    : [tls.protocol, tls.issuer, fmtDate(tls.expiresAt) ? `expira em ${fmtDate(tls.expiresAt)}` : null].filter(Boolean).join(" · ")}
                </span>
              </li>
            </ul>

            <p className="mt-6 max-w-[62ch] text-sm text-muted">
              <sup className="text-accent">*</sup> Trade-off consciente: CSP sem nonce para manter o site estático e rápido. A superfície de XSS é mínima: o
              único input é o laboratório da seção anterior, que roda só no navegador e nunca vira HTML.
            </p>

            <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs tracking-wide uppercase">
              <a
                href={`https://securityheaders.com/?q=${encodeURIComponent(audit.target)}&followRedirects=on`}
                target="_blank"
                rel="noopener noreferrer"
                className="ulink text-paper"
              >
                Verificar no securityheaders.com <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
              <a href={profile.aegisUrl} target="_blank" rel="noopener noreferrer" className="ulink text-paper">
                Abrir o Aegis <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </p>
            <p className="mt-6 font-mono text-[11px] text-dim">fonte: {audit.source}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
