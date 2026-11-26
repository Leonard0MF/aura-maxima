import { getLocale, getTranslations } from "next-intl/server";

import Image from "next/image";

import { Journey, type Milestone } from "@/components/about/Journey";
import { Decrypt } from "@/components/Decrypt";
import { about, profile } from "@/content/profile";
import { portrait } from "@/content/portrait";
import { getPortrait } from "@/lib/ascii/image";
import { cvFor } from "@/lib/site";

const isTodo = (s: string) => s.trim().startsWith("TODO");
type Item = { title: string; body: string };

/*
 * 04 · ABOUT em dois blocos, cada um cabendo em 100svh. Textos em messages
 * (about.*).
 *   1. foto editorial (P&B, sem efeito) + título, dois parágrafos,
 *      "Estudando agora" e "Próximo objetivo"
 *   2. Trajetória (linha do tempo), "Como eu trabalho", a assinatura,
 *      experiência e o currículo (se houver)
 */
export async function About() {
  const locale = await getLocale();
  const t = await getTranslations("about");
  const tn = await getTranslations("nav");
  /* máscara de alpha da foto (gerada no build): recorta o grão pela silhueta */
  const { mask, aspect } = await getPortrait();
  const cv = cvFor(locale);
  const facts = (t.raw("facts") as { label: string; value: string }[]).filter((f) => !isTodo(f.value));
  const meta = "font-mono text-[11px] tracking-wide uppercase sm:text-xs";

  return (
    <section id="about" aria-labelledby="about-title" className="bg-paper text-ink">
      {/* faixa do cabeçalho no topo; o título vai para a coluna do texto, para
          a foto ocupar a altura inteira do bloco */}
      <header className="sh about-sh">
        <div className="sh-label">
          <span>04 — {tn("about")}</span>
          <span className="text-right opacity-70">whoami</span>
        </div>
      </header>

      <div className="about-block about-intro px-4 sm:px-6">
        <figure className="about-figure">
          <div className="about-photo" style={{ "--a": aspect, "--m": `url(${mask})` } as React.CSSProperties}>
            <Image
              src={portrait.photo}
              alt={t("photoAlt", { name: profile.name })}
              sizes="(min-width: 1024px) 34vw, (min-width: 640px) 22rem, 90vw"
              quality={80}
            />
          </div>
          <figcaption className={`${meta} text-ink-soft`}>{profile.name}</figcaption>
        </figure>

        <div className="about-text">
          <h2 id="about-title" className="sh-title font-display">
            <Decrypt text={t("title")} />
          </h2>
          <p className="about-title font-display">
            <Decrypt text={t("heading")} />
          </p>
          <div className="about-body">
            {(t.raw("body") as string[]).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>

          <div className="about-now">
            <div>
              <h3 className={`${meta} text-ink-soft`}>{t("nowTitle")}</h3>
              <ul className="mt-1.5">
                {(t.raw("now") as Item[]).map((s) => (
                  <li key={s.title}>
                    <strong className="font-medium">{s.title}</strong>: {s.body}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className={`${meta} text-ink-soft`}>{t("nextTitle")}</h3>
              <ul className="mt-1.5">
                {(t.raw("next") as { title: string }[]).map((s) => (
                  <li key={s.title} className="flex items-center gap-2">
                    <span className="about-pulse" aria-hidden="true" />
                    <strong className="font-medium">{s.title}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {facts.length > 0 && (
            <dl className={`flex flex-wrap gap-x-6 gap-y-1 ${meta}`}>
              {facts.map((f) => (
                <div key={f.label} className="flex gap-2">
                  <dt className="text-ink-soft">{f.label}:</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <div className="about-block about-journey sec-end px-4 sm:px-6">
        <h3 className="about-journey__title">
          <span className={`${meta} text-ink-soft`}>{t("journeyKicker")}</span>
          <span className="font-display">{t("journeyTitle")}</span>
        </h3>
        <Journey items={t.raw("journey") as Milestone[]} label={t("journeyTitle")} />

        <div className="about-how border-t border-ink/20 pt-4">
          <h3 className={`${meta} text-ink-soft`}>{t("howTitle")}</h3>
          <ol className="mt-2 grid gap-4 md:grid-cols-3 md:gap-8">
            {(t.raw("principles") as Item[]).map((p, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug">
                <span aria-hidden="true" className="font-mono text-xs leading-5 text-accent-ink">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong className="block font-mono text-[13px] font-medium tracking-tight">{p.title}</strong>
                  {p.body}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <figure className="about-sign border-t border-ink/20 pt-4">
          <blockquote className="max-w-[70ch] italic">“{t("quote")}”</blockquote>
          <figcaption className={`mt-1.5 ${meta} text-ink-soft`}>— {about.author}</figcaption>
        </figure>

        <div className="about-exp border-t border-ink/20 pt-4">
          <div>
            <h3 className={`${meta} text-ink-soft`}>{t("experienceTitle")}</h3>
            <ul className="mt-2 space-y-1 text-[15px] leading-snug">
              {(t.raw("experience") as { org: string; role: string; period: string }[]).map((e) => (
                <li key={e.org}>
                  <span className="font-mono text-[13px] font-medium tracking-wide uppercase">{e.org}</span>
                  <span className="text-ink-soft"> · </span>
                  {e.role}
                  <span className="text-ink-soft"> · </span>
                  <span className="font-mono text-[13px]">{e.period}</span>
                </li>
              ))}
            </ul>
          </div>
          {cv && (
            <a href={cv} download className="about-cv">
              {t("cv")} <span aria-hidden="true">↓</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
