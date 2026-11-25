import Image from "next/image";
import Link from "next/link";

import { getLocale, getTranslations } from "next-intl/server";

import { SectionHead } from "@/components/SectionHead";
import { projects, type Project } from "@/content/profile";
import { localePath, type Locale } from "@/i18n/routing";

const known = (s?: string) => (s && !s.startsWith("TODO") ? s : undefined);
const pad = (n: number) => String(n).padStart(2, "0");

/*
 * 01 · WORK. Leve de propósito: sem WebGL, sem ASCII, sem blend.
 * Cada projeto cabe numa tela (≥ 1280×720): print (~58%) numa moldura de
 * janela de um lado; do outro, nome, descrição, 3 destaques, stack e links.
 * O 2º projeto inverte os lados.
 */
type T = Awaited<ReturnType<typeof getTranslations>>;

export async function Work() {
  const locale = await getLocale();
  const t = await getTranslations();
  return (
    <section id="findings" aria-labelledby="work-title" className="bg-paper text-ink">
      <SectionHead n="01" label={t("nav.work")} title={t("work.title")} id="work-title" meta={t("work.meta", { count: pad(projects.length) })}>
        {t("work.lede")}
      </SectionHead>
      <ol className="sec-end px-4 sm:px-6">
        {projects.map((p, i) => (
          <WorkItem key={p.id} p={p} i={i} total={projects.length} t={t} locale={locale} />
        ))}
      </ol>
    </section>
  );
}

function WorkItem({ p, i, total, t, locale }: { p: Project; i: number; total: number; t: T; locale: Locale }) {
  const k = `projects.${p.slug}`;
  const stack = p.stack.map((s) => (typeof s === "string" ? s : t(`${k}.stack.${s.key}`))).filter((s) => known(s));
  const caseHref = localePath(locale, `/projetos/${p.slug}`);
  const newTab = t("common.newTab");
  const meta = "font-mono text-[11px] tracking-wide uppercase sm:text-xs";
  const flip = i % 2 === 1;

  return (
    <li className="work-item border-t border-ink/20 py-8" aria-labelledby={`w-${p.slug}`}>
      <div className="grid items-center gap-8 lg:grid-cols-12 lg:gap-10">
        <figure className={`lg:col-span-7 ${flip ? "lg:order-2" : ""}`}>
          <Link href={caseHref} tabIndex={-1} aria-hidden="true" className="work-win block">
            <span className="work-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <span className="ml-3 truncate">{p.links.demo ? p.links.demo.replace(/^https?:\/\//, "").replace(/\/$/, "") : `${p.display.toLowerCase()} · ${t("work.internal")}`}</span>
            </span>
            {p.image && (
              <span className="work-fig block" style={{ aspectRatio: `${p.image.width} / ${p.image.height}` }}>
                <Image
                  src={p.image.src}
                  alt=""
                  width={p.image.width}
                  height={p.image.height}
                  sizes="(min-width: 1024px) 58vw, 100vw"
                  className="work-media h-full w-full object-cover object-top"
                />
              </span>
            )}
          </Link>
          <figcaption className={`mt-2 ${meta} text-ink-soft`}>
            {t("work.fig", { n: pad(i + 1) })} · {p.image ? t(`${k}.alt`) : t("work.pending", { title: p.title })}
          </figcaption>
        </figure>

        <div className={`work-info flex flex-col gap-3 lg:col-span-5 xl:gap-4 ${flip ? "lg:order-1" : ""}`}>
          <div className={`${meta} flex items-center justify-between gap-4`}>
            <p className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full ${p.severity === "critical" ? "bg-accent" : p.severity === "high" ? "bg-ink" : "border border-ink"}`}
              />
              {p.id} · {p.severity.toUpperCase()}
            </p>
            <p aria-label={t("work.position", { n: i + 1, total })}>
              {pad(i + 1)}/{pad(total)}
            </p>
          </div>

          <h3 id={`w-${p.slug}`} className="work-name font-display">
            {p.display}
          </h3>

          <p className={`${meta} text-ink-soft`}>
            {[t(`${k}.role`), known(p.year)].filter(Boolean).join(" · ")}
          </p>

          {p.usage && (
            <p className={`${meta} flex items-center gap-2`}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-[#17633a]" />
              {t(`${k}.usage`)}
            </p>
          )}

          <p className="text-[15px] leading-relaxed xl:text-base">{t(`${k}.summary`)}</p>

          <ol className="space-y-1.5 border-t border-ink/15 pt-3 text-sm leading-snug xl:text-[15px]">
            {(t.raw(`${k}.highlights`) as string[]).map((h, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden="true" className="font-mono text-xs leading-5 text-accent-ink">
                  {pad(j + 1)}
                </span>
                {h}
              </li>
            ))}
          </ol>

          {stack.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Stack">
              {stack.map((s) => (
                <li key={s} className="chip">
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${meta} text-ink-soft`}>{t("work.stackNone")}</p>
          )}

          <div className={`${meta} flex flex-wrap items-center gap-x-6 gap-y-2`}>
            {p.private && (
              <span className="inline-flex items-center gap-2 border border-ink/30 px-2 py-1">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />
                {t("common.private")}
              </span>
            )}
            <Link href={caseHref} className="ulink">
              {t("common.caseStudy")} <span aria-hidden="true">→</span>
            </Link>
            {p.links.demo && (
              <a href={p.links.demo} target="_blank" rel="noreferrer" className="ulink">
                {t("common.demo")} <span aria-hidden="true">↗</span>
                <span className="sr-only">{newTab}</span>
              </a>
            )}
            {p.links.repo && (
              <a href={p.links.repo} target="_blank" rel="noreferrer" className="ulink">
                {t("common.repo")} <span aria-hidden="true">↗</span>
                <span className="sr-only">{newTab}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
