import Link from "next/link";

import { Dual } from "@/components/Dual";
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

export function FindingCard({ project }: { project: Project }) {
  const featured = project.severity === "critical";
  return (
    <article
      className={`flex h-full flex-col rounded-lg border bg-surface p-5 transition-colors duration-200 hover:border-dim sm:p-6 ${
        featured ? "border-accent/40" : "border-line"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3 font-mono text-xs">
        <span className="t-term text-dim">{project.id}</span>
        <span className={`rounded border px-2 py-0.5 ${severityStyle[project.severity]}`}>
          <Dual term={project.severity.toUpperCase()} clean={cleanLabel[project.severity]} />
        </span>
      </div>
      <h3 className="text-xl font-semibold tracking-tight text-fg">{project.title}</h3>
      <p className="mt-2 line-clamp-3 text-muted">{t(project.summary)}</p>
      <ul aria-label="Stack" className="mt-4 flex flex-wrap gap-1.5 font-mono text-[11px] text-dim">
        {project.stack.map((s) => (
          <li key={s} className="rounded border border-line px-1.5 py-0.5">
            {s}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-6">
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
    </article>
  );
}
