import { Dual } from "@/components/Dual";
import { ReconTerminal } from "@/components/terminal/ReconTerminal";
import type { TerminalData } from "@/components/terminal/types";
import { profile, projects, scanLines, services } from "@/content/profile";
import { t } from "@/lib/i18n";

const fields = [
  { term: "TARGET", clean: "Nome", value: profile.fullName },
  { term: "ROLE", clean: "Cargo", value: t(profile.role) },
  { term: "LOCATION", clean: "Local", value: t(profile.location) },
  { term: "LAST SCAN", clean: "Atualizado", value: profile.lastScan },
];

const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-mono text-sm transition-colors duration-150";

/* Só o necessário para o terminal (vai no payload, não no bundle). */
const terminalData: TerminalData = {
  name: profile.name,
  whoami: profile.whoami.map((l) => t(l)),
  projects: projects.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    severity: p.severity,
    summary: t(p.summary),
    stack: p.stack,
    repo: p.links.repo,
    demo: p.links.demo,
  })),
  skills: services.map((g) => ({ port: g.port, title: t(g.title.term), state: g.state, items: g.items })),
  contact: { email: profile.contact.email, linkedin: profile.contact.linkedin, github: profile.contact.github },
  cv: profile.contact.cv,
  scan: scanLines,
};

export function Hero() {
  const { contact } = profile;
  return (
    <section
      aria-labelledby="hero-title"
      className="mx-auto grid max-w-[75rem] items-center gap-10 px-4 pt-10 pb-14 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12 lg:pt-20 lg:pb-16"
    >
      <div>
        <p className="mb-5 font-mono text-xs tracking-wide text-dim">
          <Dual term="RECON REPORT · CONFIDENTIAL-ISH · v2026.11" clean="Portfólio" />
        </p>

        <h1 id="hero-title" className="text-[clamp(2.75rem,7.2vw,6rem)] leading-[0.95] font-bold tracking-[-0.04em] text-fg">
          {profile.name}
        </h1>
        <p className="mt-4 font-mono text-lg font-medium text-accent sm:text-xl">{t(profile.role)}</p>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t(profile.tagline)}</p>

        <dl className="mt-8 grid grid-cols-1 border-y border-line font-mono text-[13px] sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.term} className="flex gap-4 border-b border-line py-2.5">
              <dt className="w-24 shrink-0 text-dim">
                <Dual term={f.term} clean={f.clean} />
              </dt>
              <dd className="text-fg">{f.value}</dd>
            </div>
          ))}
          <div className="flex gap-4 py-2.5 sm:col-span-2">
            <dt className="w-24 shrink-0 text-dim">
              <Dual term="STATUS" clean="Status" />
            </dt>
            <dd className="flex items-center gap-2 text-fg">
              <span aria-hidden="true" className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-accent" />
              </span>
              {t(profile.status)}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#findings" className={`${btn} bg-accent font-medium text-bg hover:bg-accent/90`}>
            Ver projetos
          </a>
          <a href={contact.cv} download className={`${btn} border border-line text-fg hover:border-accent`}>
            Baixar currículo (PDF)
          </a>
        </div>
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm text-muted">
          <li>
            <a href={contact.github} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              GitHub<span className="sr-only"> (abre em nova aba)</span>
            </a>
          </li>
          <li>
            <a href={contact.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              LinkedIn<span className="sr-only"> (abre em nova aba)</span>
            </a>
          </li>
          <li>
            <a href={`mailto:${contact.email}`} className="hover:text-accent">
              {contact.email}
            </a>
          </li>
        </ul>
      </div>

      <div className="t-term min-w-0">
        <ReconTerminal data={terminalData} />
      </div>

      {/* Modo clean: resumo direto no lugar do terminal. */}
      <aside aria-label="Resumo" className="t-clean rounded-xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-sm font-medium text-dim">Resumo</h2>
        <ul className="mt-4 space-y-3 text-muted">
          {profile.whoami.map((l) => (
            <li key={t(l)} className="flex gap-3">
              <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
              {t(l)}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-dim">Projeto principal</p>
        <a href={`/projetos/${projects[0].slug}`} className="mt-1 block text-lg font-semibold text-fg hover:text-accent">
          {projects[0].title} →
        </a>
        <p className="mt-1 text-sm text-muted">{t(projects[0].summary)}</p>
      </aside>
    </section>
  );
}
