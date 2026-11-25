import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Image from "next/image";

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

function Block({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-ink/20 py-10 md:grid-cols-12 md:gap-8">
      <h2 className="font-mono text-[11px] tracking-wide text-ink-soft uppercase md:col-span-3 sm:text-xs">
        {n} · {title}
      </h2>
      <div className="max-w-[62ch] text-lg leading-relaxed md:col-span-9">{children}</div>
    </section>
  );
}

function List({ items }: { items: Localized[] }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={t(i)} className="flex gap-3">
          <span aria-hidden="true" className="font-mono text-ink-soft">
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
      <main id="conteudo" className="bg-paper px-4 pt-10 pb-20 text-ink sm:px-6 sm:pt-16">
        <header className="mb-12 [container-type:inline-size]">
          <p className="font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs">
            {project.id} · {project.severity.toUpperCase()} · Estudo de caso
          </p>
          <h1 className="mt-4 font-display text-[clamp(3.5rem,14vw,12rem)] leading-[0.8] tracking-[-0.035em]">{project.display}</h1>
          <p className="mt-8 max-w-[48ch] text-xl leading-snug sm:text-2xl">{t(project.summary)}</p>
          <p className="mt-6 font-mono text-xs tracking-wide uppercase">
            <span className="text-ink-soft">Stack </span>
            {project.stack.filter((s) => !s.startsWith("TODO")).join(" · ") || "—"}
          </p>
          <div className="mt-6 flex flex-wrap gap-6 font-mono text-xs tracking-wide uppercase">
            {project.private && <span>Sistema interno · privado</span>}
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
          {project.image && (
            <div className="work-win mt-10">
              <span className="work-bar" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <Image src={project.image.src} alt={t(project.image.alt)} width={project.image.width} height={project.image.height} sizes="100vw" className="block h-auto w-full" />
            </div>
          )}
        </header>

        <Block n="01" title="Problema">
          <p>{t(cs.problem)}</p>
        </Block>
        <Block n="02" title="Solução">
          <p>{t(cs.solution)}</p>
        </Block>
        <Block n="03" title="Arquitetura">
          <List items={cs.architecture} />
        </Block>
        <Block n="04" title="Decisões técnicas e de segurança">
          <List items={cs.decisions} />
        </Block>
        <Block n="05" title="Resultado">
          <p>{t(cs.result)}</p>
        </Block>
      </main>
      <SiteFooter />
    </>
  );
}
