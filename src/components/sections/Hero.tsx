import { Dual } from "@/components/Dual";
import { profile } from "@/content/profile";
import { t } from "@/lib/i18n";

const fields = [
  { term: "TARGET", clean: "Nome", value: profile.fullName },
  { term: "ROLE", clean: "Cargo", value: t(profile.role) },
  { term: "LOCATION", clean: "Local", value: t(profile.location) },
  { term: "LAST SCAN", clean: "Atualizado", value: profile.lastScan },
];

const btn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 font-mono text-sm transition-colors duration-150";

export function Hero() {
  const { contact } = profile;
  return (
    <section aria-labelledby="hero-title" className="dossier mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 sm:pt-24 sm:pb-28">
      <p className="mb-6 font-mono text-xs tracking-wide text-dim">
        <Dual term="RECON REPORT · CONFIDENTIAL-ISH · v2026.11" clean="Portfólio" />
      </p>

      <h1 id="hero-title" className="text-4xl font-semibold tracking-tight text-fg sm:text-6xl">
        {profile.name}
      </h1>
      <p className="mt-3 font-mono text-base text-accent sm:text-lg">{t(profile.role)}</p>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{t(profile.tagline)}</p>

      <dl className="mt-10 grid max-w-3xl grid-cols-1 border-y border-line font-mono text-sm sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.term} className="flex gap-4 border-b border-line py-3 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0">
            <dt className="w-24 shrink-0 text-dim">
              <Dual term={f.term} clean={f.clean} />
            </dt>
            <dd className="text-fg">{f.value}</dd>
          </div>
        ))}
        <div className="flex gap-4 py-3 sm:col-span-2 sm:border-t sm:border-line">
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

      <div className="mt-10 flex flex-wrap gap-3">
        <a href="#findings" className={`${btn} bg-accent font-medium text-bg hover:bg-accent/90`}>
          Ver projetos
        </a>
        <a href={contact.cv} download className={`${btn} border border-line text-fg hover:border-accent`}>
          Baixar currículo (PDF)
        </a>
      </div>
      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm text-muted">
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
    </section>
  );
}
