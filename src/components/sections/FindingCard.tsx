import Link from "next/link";

import { Dual } from "@/components/Dual";
import { ProjectPreview } from "@/components/ProjectPreview";
import type { Project, Severity } from "@/content/profile";
import { t } from "@/lib/i18n";

const severityStyle: Record<Severity, string> = {
  critical: "border-accent/60 text-accent bg-accent-soft",
  high: "border-line text-fg",
  medium: "border-line text-muted",
};

const cleanLabel: Record<Severity, string> = {
  critical: "Projeto principal",
  high: "Destaque",
  medium: "Projeto",
};

const linkCls = "font-mono text-xs text-muted underline decoration-line underline-offset-4 hover:text-accent";

function Meta({ project }: { project: Project }) {
  return (
    <div className="mb-3 flex items-center gap-3 font-mono text-xs">
      <span className="t-term text-dim">{project.id}</span>
      <span className={`rounded border px-2 py-0.5 ${severityStyle[project.severity]}`}>
        <Dual term={project.severity.toUpperCase()} clean={cleanLabel[project.severity]} />
      </span>
    </div>
  );
}

function Links({ project }: { project: Project }) {
  return (
    <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-5">
      <Link href={`/projetos/${project.slug}`} className={linkCls}>
        <Dual term="./case-study" clean="Estudo de caso" />
        <span className="sr-only"> de {project.title}</span>
      </Link>
      {project.links.demo ? (
        <a href={project.links.demo} target="_blank" rel="noopener noreferrer" className={linkCls}>
          Demo<span className="sr-only"> de {project.title} (abre em nova aba)</span>
        </a>
      ) : null}
      {project.links.repo ? (
        <a href={project.links.repo} target="_blank" rel="noopener noreferrer" className={linkCls}>
          Repo<span className="sr-only"> de {project.title} (abre em nova aba)</span>
        </a>
      ) : null}
    </div>
  );
}

function Stack({ items }: { items: string[] }) {
  return (
    <ul aria-label="Stack" className="mt-4 flex flex-wrap gap-1.5 font-mono text-[11px] text-dim">
      {items.map((s) => (
        <li key={s} className="rounded border border-line px-1.5 py-0.5">
          {s}
        </li>
      ))}
    </ul>
  );
}

const cardCls =
  "finding group flex h-full rounded-xl border bg-surface p-4 transition-colors duration-200 hover:border-accent/70 focus-within:border-accent/70 sm:p-5";

/* Card grande (CRITICAL): texto e destaques à esquerda, preview à direita. */
export function FeaturedFinding({ project }: { project: Project }) {
  return (
    <article className={`${cardCls} flex-col-reverse gap-6 border-accent/40 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10 lg:p-8`}>
      <div className="flex flex-col">
        <Meta project={project} />
        <h3 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">{project.title}</h3>
        <p className="mt-3 text-muted">{t(project.summary)}</p>
        {project.highlights ? (
          <ul className="mt-5 space-y-2">
            {project.highlights.map((h) => (
              <li key={t(h)} className="flex gap-3 text-sm text-fg">
                <span aria-hidden="true" className="font-mono text-accent">
                  ▸
                </span>
                {t(h)}
              </li>
            ))}
          </ul>
        ) : null}
        <Stack items={project.stack} />
        <Links project={project} />
      </div>
      <ProjectPreview project={project} sizes="(min-width: 1024px) 680px, 100vw" />
    </article>
  );
}

export function FindingCard({ project }: { project: Project }) {
  return (
    <article className={`${cardCls} flex-col border-line`}>
      <ProjectPreview project={project} sizes="(min-width: 768px) 560px, 100vw" />
      <div className="flex flex-1 flex-col pt-5">
        <Meta project={project} />
        <h3 className="text-xl font-semibold tracking-tight text-fg">{project.title}</h3>
        <p className="mt-2 text-muted">{t(project.summary)}</p>
        <Stack items={project.stack} />
        <Links project={project} />
      </div>
    </article>
  );
}
