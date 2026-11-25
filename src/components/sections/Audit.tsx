import { SectionHead } from "@/components/SectionHead";
import { audit } from "@/content/audit";
import { profile } from "@/content/profile";

import { AuditReplay } from "./AuditReplay";

/*
 * 03 · AUDIT: "Escaneie este site". A única seção escura; o fundo faz um fade
 * do papel para o escuro com a rolagem e volta na saída (CSS scroll-driven
 * animation, só opacity, preso à seção). Sem suporte ou com reduced-motion:
 * seção escura direto. O conteúdo é o replay de um scan do Aegis (audit.json).
 */
export function Audit() {
  return (
    <section id="auditoria" aria-labelledby="audit-title" className="audit theme-dark">
      <div className="audit-bg" aria-hidden="true" />
      <div className="audit-body text-fg">
        <SectionHead n="03" label="Audit" title="Escaneie este site" id="audit-title" meta={`aegis scan ${audit.target}`}>
          <span className="text-muted">O Aegis, meu scanner, rodando sobre este portfólio.</span>
        </SectionHead>
        <div className="sec-end px-4 sm:px-6">
          <AuditReplay />
          <p className="mt-4">
            <a href={profile.aegisUrl} target="_blank" rel="noopener noreferrer" className="audit-cta">
              Escaneie o site da sua empresa no Aegis <span aria-hidden="true">↗</span>
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
