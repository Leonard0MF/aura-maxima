import fs from "node:fs";
import path from "node:path";
import Image from "next/image";

import { Decrypt } from "@/components/Decrypt";
import { SectionHead } from "@/components/SectionHead";
import { about, activity, profile } from "@/content/profile";
import { t } from "@/lib/i18n";

const isTodo = (s: string) => s.trim().startsWith("TODO");
/* roda no build (a home é SSG): o que não existe em public/ não vira link quebrado */
const inPublic = (url: string) =>
  fs.existsSync(path.join(process.cwd(), "public", url.replace(/^\//, "")));

/*
 * 04 · ABOUT (cabe em 100svh). Esquerda: foto em P&B, o que estou estudando,
 * experiência e currículo. Direita: título display, texto em primeira pessoa
 * (colunas no desktop), "Como eu trabalho" em 3 colunas e, no fim, a
 * assinatura separada por uma hairline. Dados em content/profile.ts.
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
          <div className="flex flex-col gap-3.5 lg:col-span-3">
            <figure>
              <div className="about-photo relative aspect-[4/5] w-full overflow-hidden border border-ink/20">
                {hasPhoto ? (
                  <Image src={about.photo} alt={`Foto de ${profile.name}`} fill sizes="(min-width: 1024px) 25vw, 100vw" className="object-cover" />
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

            <div className="font-mono text-xs leading-relaxed">
              <h3 className={`${meta} text-ink-soft`}>Estudando agora</h3>
              <ul className="mt-1">
                {about.studying.now.map((s) => (
                  <li key={t(s.title)}>
                    <strong className="font-medium">{t(s.title)}</strong>: {t(s.body)}
                  </li>
                ))}
              </ul>
              <h3 className={`mt-2 ${meta} text-ink-soft`}>Próximo objetivo</h3>
              <ul className="mt-1">
                {about.studying.next.map((s) => (
                  <li key={t(s.title)}>
                    <strong className="font-medium">{t(s.title)}</strong>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className={`${meta} text-ink-soft`}>Experiência</h3>
              <table className="mt-1 w-full text-left text-[13px] leading-snug">
                <tbody>
                  {activity.map((a) => {
                    const period = t(a.period);
                    return (
                      <tr key={a.org} className="border-b border-ink/20 align-baseline">
                        <th scope="row" className="py-1 pr-3 font-mono text-xs font-normal tracking-wide uppercase">
                          {a.org}
                          <span className="block font-sans tracking-normal text-ink-soft normal-case">{t(a.role)}</span>
                        </th>
                        <td className="py-1 text-right font-mono text-xs whitespace-nowrap uppercase">
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

            {(facts.length > 0 || cv) && (
              <div className="flex flex-col items-start gap-3">
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

          <div className="flex flex-col gap-4 lg:col-span-9">
            <p className="about-title font-display">
              <Decrypt text={t(about.title)} />
            </p>
            <div className="about-body">
              {about.body.map((p, i) => (
                <p key={i}>{t(p)}</p>
              ))}
            </div>

            <div className="border-t border-ink/20 pt-4">
              <h3 className={`${meta} text-ink-soft`}>Como eu trabalho</h3>
              <ol className="mt-2 grid gap-4 md:grid-cols-3 md:gap-8">
                {about.principles.map((p, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-snug">
                    <span aria-hidden="true" className="font-mono text-xs leading-5 text-accent-ink">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong className="block font-mono text-[13px] font-medium tracking-tight">{t(p.title)}</strong>
                      {t(p.body)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <figure className="about-sign border-t border-ink/20 pt-4">
              <blockquote className="max-w-[70ch] italic">“{t(about.signature.quote)}”</blockquote>
              <figcaption className={`mt-1.5 ${meta} text-ink-soft`}>— {about.signature.author}</figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
