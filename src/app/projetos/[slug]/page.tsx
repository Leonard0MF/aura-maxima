import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Dual } from "@/components/Dual";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { projects } from "@/content/profile";
import { t, type Localized } from "@/lib/i18n";

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

function Block({ n, term, title, children }: { n: string; term: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-line py-10 md:grid-cols-[12rem_1fr] md:gap-8">
      <h2 className="font-mono text-sm text-dim">
        <span className="text-accent">{n}</span> <Dual term={term} clean={title} />
      </h2>
      <div className="max-w-2xl leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function List({ items }: { items: Localized[] }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={t(i)} className="flex gap-3">
          <span aria-hidden="true" className="font-mono text-dim">
            –
          </span>
          {t(i)}
        </li>
      ))}
    </ul>
  );
}

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();
  const { caseStudy: cs } = project;

  return (
    <>
      <SiteHeader />
      <main id="conteudo" className="mx-auto max-w-[75rem] px-4 pt-12 pb-20 sm:px-6 sm:pt-16">
        <Link href="/#findings" className="font-mono text-xs text-muted hover:text-accent">
          <Dual term="cd ../findings" clean="← Voltar aos projetos" />
        </Link>
        <header className="mt-8 mb-12">
          <p className="font-mono text-xs text-dim">
            <Dual term={`${project.id} · ${project.severity.toUpperCase()}`} clean="Estudo de caso" />
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">{project.title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">{t(project.summary)}</p>
          <ul aria-label="Stack" className="mt-6 flex flex-wrap gap-1.5 font-mono text-xs text-dim">
            {project.stack.map((s) => (
              <li key={s} className="rounded border border-line px-2 py-0.5">
                {s}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-5 font-mono text-sm">
            {project.links.demo ? (
              <a href={project.links.demo} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Demo<span className="sr-only"> (abre em nova aba)</span>
              </a>
            ) : null}
            {project.links.repo ? (
              <a href={project.links.repo} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Repositório<span className="sr-only"> (abre em nova aba)</span>
              </a>
            ) : null}
          </div>
        </header>

        <Block n="01" term="problem" title="Problema">
          <p>{t(cs.problem)}</p>
        </Block>
        <Block n="02" term="solution" title="Solução">
          <p>{t(cs.solution)}</p>
        </Block>
        <Block n="03" term="architecture" title="Arquitetura">
          <List items={cs.architecture} />
        </Block>
        <Block n="04" term="decisions --security" title="Decisões técnicas e de segurança">
          <List items={cs.decisions} />
        </Block>
        <Block n="05" term="result" title="Resultado">
          <p>{t(cs.result)}</p>
        </Block>
      </main>
      <SiteFooter />
    </>
  );
}
