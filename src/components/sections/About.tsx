import fs from "node:fs";
import path from "node:path";
import Image from "next/image";

import { Decrypt } from "@/components/Decrypt";
import { SectionHead } from "@/components/SectionHead";
import { about, activity, profile } from "@/content/profile";
import { t } from "@/lib/i18n";

const isTodo = (s: string) => s.trim().startsWith("TODO");
/* roda no build (a home é SSG): o que não existe em public/ não vira link quebrado */
const inPublic = (url: string) => fs.existsSync(path.join(process.cwd(), "public", url.replace(/^\//, "")));

/*
 * 04 · ABOUT (cabe em 100svh). Esquerda: foto em P&B, tratamento editorial.
 * Direita: abertura grande, texto em primeira pessoa, "Como eu trabalho",
 * experiência em tabela curta e o currículo. Dados em content/profile.ts.
 */
export function About() {
  const hasPhoto = inPublic(about.photo);
  const cv = inPublic(profile.contact.cv) ? profile.contact.cv : null;
  const facts = about.facts.filter((f) => !isTodo(t(f.value)));
  const meta = "font-mono text-[11px] tracking-wide uppercase sm:text-xs";

  return (
    <section id="about" aria-labelledby="about-title" className="bg-paper text-ink">
      <SectionHead n="04" label="About" title="Sobre mim" id="about-title" meta="whoami" />

      <div className="sec-end px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          <figure className="lg:col-span-3">
            <div className="about-photo relative aspect-[4/5] w-full max-w-[420px] overflow-hidden border border-ink/20">
              {hasPhoto ? (
                <Image src={about.photo} alt={`Foto de ${profile.name}`} fill sizes="(min-width: 1024px) 30vw, 100vw" className="object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-ink/5 p-6 text-center">
                  <p className={`${meta} text-ink-soft`}>
                    Foto pendente
                    <br />
                    <span className="normal-case">public/portrait.png</span>
                  </p>
                </div>
              )}
            </div>
            <figcaption className={`mt-2 ${meta} text-ink-soft`}>{profile.name}</figcaption>
          </figure>

          <div className="flex flex-col gap-6 lg:col-span-9">
            <p className="max-w-[26ch] text-[clamp(1.6rem,2.6vw,2.6rem)] leading-[1.08] font-medium tracking-tight">
              <Decrypt text={t(about.opening)} />
            </p>
            <p className="max-w-[72ch] text-[15px] leading-relaxed xl:text-base">{t(about.body)}</p>

            <div className="grid gap-6 border-t border-ink/20 pt-4 md:grid-cols-2 md:gap-10">
              <div>
                <h3 className={`${meta} text-ink-soft`}>Como eu trabalho</h3>
                <ol className="mt-2 space-y-1.5 text-[15px] leading-snug">
                  {about.principles.map((p, i) => (
                    <li key={i} className="flex gap-3">
                      <span aria-hidden="true" className="font-mono text-xs leading-5 text-accent-ink">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {t(p)}
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h3 className={`${meta} text-ink-soft`}>Experiência</h3>
                <table className="mt-2 w-full text-left text-sm">
                  <tbody>
                    {activity.map((a) => {
                      const period = t(a.period);
                      return (
                        <tr key={a.org} className="border-b border-ink/20 align-baseline">
                          <th scope="row" className="py-2 pr-4 font-mono text-xs font-normal tracking-wide whitespace-nowrap uppercase">
                            {a.org}
                          </th>
                          <td className="py-2 pr-4 text-ink-soft">{t(a.role)}</td>
                          <td className="py-2 font-mono text-xs whitespace-nowrap uppercase">
                            {isTodo(period) ? "—" : period}
                            {a.current && (
                              <>
                                <span className="ml-2 inline-block size-1.5 rounded-full bg-accent align-middle" aria-hidden="true" />
                                <span className="sr-only"> (atual)</span>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {(facts.length > 0 || cv) && (
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                {facts.length > 0 && (
                  <dl className={`flex flex-wrap gap-x-6 gap-y-1 ${meta}`}>
                    {facts.map((f) => (
                      <div key={t(f.label)} className="flex gap-2">
                        <dt className="text-ink-soft">{t(f.label)}:</dt>
                        <dd>{t(f.value)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {cv && (
                  <a href={cv} download className="about-cv">
                    Baixar currículo (PDF) <span aria-hidden="true">↓</span>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
