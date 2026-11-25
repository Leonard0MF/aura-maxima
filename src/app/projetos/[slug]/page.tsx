import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import Image from "next/image";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { cases, type Block, type FlowNode } from "@/content/cases";
import { projects } from "@/content/profile";
import { t } from "@/lib/i18n";

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

function getProject(slug: string) {
  return projects.find((p) => p.slug === slug);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};
  return {
    title: `${project.title} · Estudo de caso`,
    description: t(project.summary),
    alternates: { canonical: `/projetos/${project.slug}` },
    openGraph: { title: `${project.title} · Estudo de caso`, description: t(project.summary), url: `/projetos/${project.slug}` },
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const isTodo = (s: string) => s.startsWith("TODO");

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-ink/20 py-10 md:grid-cols-12 md:gap-8 md:py-14">
      <h2 className="md:col-span-3">
        <span className="block font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs">{pad(n)}</span>
        <span className="mt-2 block font-display text-2xl leading-none tracking-tight sm:text-3xl">{title}</span>
      </h2>
      <div className="md:col-span-9">{children}</div>
    </section>
  );
}

const Para = ({ body }: { body: string[] }) => (
  <div className="max-w-[64ch] space-y-4 text-lg leading-relaxed">
    {body.map((b) => (
      <p key={b} className={isTodo(b) ? "text-ink-soft" : undefined}>
        {b}
      </p>
    ))}
  </div>
);

/* régua das faixas de nota: largura de cada faixa = intervalo de pontos */
function ScoreScale({ bands }: { bands: { grade: string; min: number }[] }) {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  return (
    <figure className="mt-8 max-w-3xl">
      <div className="flex h-14 border border-ink/30" role="img" aria-label={sorted.map((b, i) => `${b.grade}: ${b.min} a ${(sorted[i + 1]?.min ?? 101) - 1}`).join("; ")}>
        {sorted.map((b, i) => {
          const max = sorted[i + 1]?.min ?? 100;
          const top = i === sorted.length - 1;
          return (
            <div
              key={b.grade}
              className={`flex items-center justify-center border-r border-ink/30 font-display text-xl last:border-r-0 ${top ? "bg-ink text-paper" : i === 0 ? "bg-[#b3261e]/10" : ""}`}
              style={{ width: `${max - b.min}%` }}
            >
              {b.grade}
            </div>
          );
        })}
      </div>
      <div className="relative mt-2 h-4 font-mono text-[11px] text-ink-soft">
        {[...sorted.map((b) => b.min), 100].map((m) => (
          <span key={m} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${m}%` }}>
            {m}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 font-mono text-[11px] tracking-wide text-ink-soft uppercase">
        Faixas: {[...sorted].reverse().map((b) => (b.min === 0 ? `${b.grade} < ${sorted[1].min}` : `${b.grade} ≥ ${b.min}`)).join(" · ")}
      </figcaption>
    </figure>
  );
}

/* diagrama do fluxo em HTML: caixas com hairlines e setas */
function Flow({ flow, link = "→", caption, sources }: { flow: (FlowNode | FlowNode[])[]; link?: "→" | "↔"; caption?: string; sources?: string[] }) {
  const stages = flow.map((f) => (Array.isArray(f) ? f : [f]));
  let n = 0;
  const describe = stages.map((st) => st.map((f) => f.label).join(" + ")).join(` ${link} `);
  return (
    <figure className="mt-8">
      <ol
        className="grid gap-3 md:grid-cols-[repeat(var(--n),1fr)] md:gap-0"
        style={{ "--n": stages.length } as CSSProperties}
      >
        {stages.map((st, i) => (
          <li key={st[0].label} className="relative flex md:items-center">
            <div className="flex w-full flex-col gap-2">
              {st.map((f) => (
                <div key={f.label} className="w-full border border-ink/40 p-4">
                  <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase">{pad(++n)}</p>
                  <p className="mt-1 font-display text-xl leading-tight">{f.label}</p>
                  <p className={`mt-2 text-sm ${isTodo(f.note) || f.note === "TODO" ? "text-ink-soft" : ""}`}>{f.note}</p>
                </div>
              ))}
            </div>
            {i < stages.length - 1 && (
              <span aria-hidden="true" className="hidden w-8 shrink-0 items-center justify-center font-mono text-lg md:flex">
                {link}
              </span>
            )}
          </li>
        ))}
      </ol>
      {caption && <p className="mt-3 font-mono text-[11px] tracking-wide text-ink-soft uppercase">{caption}</p>}
      {sources && (
        <p className="mt-4 font-mono text-[11px] tracking-wide text-ink-soft uppercase">
          Fontes: <span className="text-ink">{sources.join(" · ")}</span>
        </p>
      )}
      <figcaption className="sr-only">Diagrama: {describe}</figcaption>
    </figure>
  );
}

function render(b: Block) {
  switch (b.kind) {
    case "text":
      return <Para body={b.body} />;
    case "groups":
      return (
        <dl className="grid border-t border-ink/20 md:grid-cols-2 md:gap-x-10">
          {b.groups.map((g) => (
            <div key={g.label} className="border-b border-ink/20 py-4">
              <dt className="font-mono text-xs tracking-wide uppercase">{g.label}</dt>
              <dd className={`mt-1.5 leading-relaxed ${isTodo(g.items) ? "text-ink-soft" : ""}`}>{g.items}</dd>
            </div>
          ))}
        </dl>
      );
    case "score":
      return (
        <>
          <Para body={b.body} />
          <ul className="mt-4 grid max-w-3xl gap-2 font-mono text-sm sm:grid-cols-2">
            {b.caps.map((c) => (
              <li key={c} className="flex gap-2 border-t border-ink/20 pt-2">
                <span aria-hidden="true" className="text-[#b3261e]">
                  ▲
                </span>
                {c}
              </li>
            ))}
          </ul>
          <ScoreScale bands={b.bands} />
        </>
      );
    case "bullets":
      return (
        <>
          {b.body && <Para body={b.body} />}
          <ul className="max-w-[64ch] divide-y divide-ink/20 border-y border-ink/20 text-lg">
            {b.items.map((i, k) => (
              <li key={i} className={`flex gap-4 py-3 ${isTodo(i) ? "text-ink-soft" : ""}`}>
                <span aria-hidden="true" className="font-mono text-xs leading-7 text-accent-ink">
                  {pad(k + 1)}
                </span>
                {i}
              </li>
            ))}
          </ul>
        </>
      );
    case "arch":
      return (
        <>
          <Para body={b.body} />
          {b.routes && (
            <p className="mt-4 flex flex-wrap gap-2 font-mono text-xs">
              {b.routes.map((r) => (
                <code key={r} className="border border-ink/30 px-2 py-1">
                  {r}
                </code>
              ))}
            </p>
          )}
          <Flow flow={b.flow} link={b.link} caption={b.caption} sources={b.sources} />
        </>
      );
  }
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();
  const blocks = cases[project.slug] ?? [];
  const stack = project.stack.filter((s) => !isTodo(s));

  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="bg-paper px-4 pt-8 pb-20 text-ink sm:px-6 sm:pt-12">
        <header className="grid gap-8 pb-12 lg:grid-cols-12 lg:gap-10">
          <div className="work-info lg:col-span-5">
            <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs">
              {project.id} · {project.severity.toUpperCase()} · Estudo de caso
            </p>
            <h1 className="case-title mt-4 font-display leading-[0.85] tracking-[-0.035em]">{project.display}</h1>
            <p className="mt-6 max-w-[48ch] text-lg leading-relaxed">{t(project.summary)}</p>
            <dl className="mt-6 divide-y divide-ink/15 border-y border-ink/15 font-mono text-xs tracking-wide uppercase">
              <div className="grid grid-cols-[5rem_1fr] gap-4 py-2">
                <dt className="text-ink-soft">Papel</dt>
                <dd>{project.role ? t(project.role) : "—"}</dd>
              </div>
              <div className="grid grid-cols-[5rem_1fr] gap-4 py-2">
                <dt className="text-ink-soft">Ano</dt>
                <dd>{project.year ?? "—"}</dd>
              </div>
              {project.usage && (
                <div className="grid grid-cols-[5rem_1fr] gap-4 py-2">
                  <dt className="text-ink-soft">Uso</dt>
                  <dd>{t(project.usage)}</dd>
                </div>
              )}
              <div className="grid grid-cols-[5rem_1fr] gap-4 py-2">
                <dt className="text-ink-soft">Stack</dt>
                <dd>{stack.length ? stack.join(" · ") : "—"}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-6 font-mono text-xs tracking-wide uppercase">
              {project.private && <span className="border border-ink/30 px-2 py-1">Sistema interno · privado</span>}
              {project.links.demo ? (
                <a href={project.links.demo} target="_blank" rel="noopener noreferrer" className="ulink">
                  Demo <span aria-hidden="true">↗</span>
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              ) : null}
              {project.links.repo ? (
                <a href={project.links.repo} target="_blank" rel="noopener noreferrer" className="ulink">
                  Repo <span aria-hidden="true">↗</span>
                  <span className="sr-only"> (abre em nova aba)</span>
                </a>
              ) : null}
            </div>
          </div>
          {project.image && (
            <div className="work-win self-start lg:col-span-7">
              <span className="work-bar" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <Image
                src={project.image.src}
                alt={t(project.image.alt)}
                width={project.image.width}
                height={project.image.height}
                sizes="(min-width: 1024px) 58vw, 100vw"
                priority
                className="block h-auto w-full"
              />
            </div>
          )}
        </header>

        {blocks.map((b, i) => (
          <Section key={b.title} n={i + 1} title={b.title}>
            {render(b)}
          </Section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}
