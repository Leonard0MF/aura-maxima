import Image from "next/image";
import Link from "next/link";

import { Decrypt } from "@/components/Decrypt";
import { Dual } from "@/components/Dual";
import { projects, type Project } from "@/content/profile";
import { t } from "@/lib/i18n";

const known = (s?: string) => (s && !s.startsWith("TODO") ? s : undefined);
const pad = (n: number) => String(n).padStart(2, "0");

/*
 * 01 · WORK. Leve de propósito: sem WebGL, sem ASCII, sem blend.
 * Cada projeto: nome gigante (todos no mesmo corpo, alinhados à esquerda),
 * print à esquerda e uma coluna com descrição, papel, ano, stack, destaques
 * e links. Organização por hairlines, sem cards.
 */
export function Work() {
  return (
    <section id="findings" aria-labelledby="work-title" className="bg-paper text-ink">
      <header className="sec-head">
        <div className="sec-meta">
          <span>01</span>
          <span className="text-ink-soft">
            <Dual term="recon --findings --sort=severity" clean="Projetos selecionados" />
          </span>
          <span>{pad(projects.length)} projetos</span>
        </div>
        <h2 id="work-title" className="sec-title font-display">
          <Decrypt text="WORK" />
        </h2>
      </header>

      <ol className="px-4 pb-16 sm:px-6 sm:pb-24">
        {projects.map((p, i) => (
          <WorkItem key={p.id} p={p} i={i} total={projects.length} />
        ))}
      </ol>
    </section>
  );
}

function WorkItem({ p, i, total }: { p: Project; i: number; total: number }) {
  const stack = p.stack.filter((s) => known(s));
  const meta = "font-mono text-[11px] tracking-wide uppercase sm:text-xs";

  return (
    <li className="work-item border-t border-ink/20 pt-4 pb-14 sm:pb-20" aria-labelledby={`w-${p.slug}`}>
      <div className={`${meta} flex items-center justify-between gap-4`}>
        <p className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${p.severity === "critical" ? "bg-accent" : p.severity === "high" ? "bg-ink" : "border border-ink"}`}
          />
          <Dual term={`${p.id} · ${p.severity.toUpperCase()}`} clean={`Projeto ${pad(i + 1)}`} />
        </p>
        <p aria-label={`Projeto ${i + 1} de ${total}`}>
          {pad(i + 1)}/{pad(total)}
        </p>
      </div>

      <h3 id={`w-${p.slug}`} className="work-name mt-6 font-display" style={{ ["--w" as string]: 5.5 }}>
        <span className="sr-only">{p.title}</span>
        <span aria-hidden="true">{p.display}</span>
      </h3>

      <div className="mt-6 grid gap-8 sm:mt-10 lg:grid-cols-12 lg:gap-10">
        <figure className="lg:col-span-7">
          <Link href={`/projetos/${p.slug}`} tabIndex={-1} aria-hidden="true" className="work-fig block">
            {p.image ? (
              <Image
                src={p.image.src}
                alt=""
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="work-media object-cover"
              />
            ) : (
              <span className="work-media work-ph">
                <span className="text-center font-mono text-[11px] tracking-wide text-ink-soft uppercase">
                  {p.display}
                  <br />
                  print em breve
                </span>
              </span>
            )}
          </Link>
          <figcaption className={`work-cap mt-2 flex justify-between gap-4 ${meta} text-ink-soft`}>
            <span>
              Fig. {pad(i + 1)} · {p.image ? t(p.image.alt) : `${p.title}: print pendente`}
            </span>
            <span aria-hidden="true">↗</span>
          </figcaption>
        </figure>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <p className="max-w-[48ch] text-[17px] leading-relaxed sm:text-lg">{t(p.summary)}</p>

          <dl className={`${meta} divide-y divide-ink/15 border-y border-ink/15`}>
            {p.role && <Row k="Papel" v={t(p.role)} />}
            {known(p.year) && <Row k="Ano" v={p.year!} />}
            {stack.length > 0 && <Row k="Stack" v={stack.join(" · ")} />}
          </dl>

          {p.highlights && (
            <ul className="space-y-1.5 text-[15px] leading-relaxed">
              {p.highlights.map((h, j) => (
                <li key={j} className="flex gap-3">
                  <span aria-hidden="true" className="font-mono text-xs leading-[1.7rem] text-accent-ink">
                    {pad(j + 1)}
                  </span>
                  {t(h)}
                </li>
              ))}
            </ul>
          )}

          <p className={`${meta} flex gap-6`}>
            <Link href={`/projetos/${p.slug}`} className="ulink">
              Estudo de caso <span aria-hidden="true">→</span>
            </Link>
            {p.links.repo && (
              <a href={p.links.repo} target="_blank" rel="noreferrer" className="ulink">
                Repo <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            )}
            {p.links.demo && (
              <a href={p.links.demo} target="_blank" rel="noreferrer" className="ulink">
                Demo <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            )}
          </p>
        </div>
      </div>
    </li>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-4 py-2">
      <dt className="text-ink-soft">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
