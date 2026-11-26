import type { CSSProperties } from "react";

import { AsciiStage } from "@/components/hero/AsciiStage";
import { HeroLayer } from "@/components/hero/HeroLayer";
import { LocalTime } from "@/components/hero/LocalTime";
import { MobileMenu } from "@/components/hero/MobileMenu";
import { getLocale, getTranslations } from "next-intl/server";

import { LangSwitch } from "@/components/LangSwitch";
import { profile } from "@/content/profile";
import { SHOW_ENIGMA } from "@/content/enigma";
import { getEnigma, getPortrait } from "@/lib/ascii/image";

const nav = [
  { n: "01", key: "work", href: "#findings" },
  { n: "02", key: "stack", href: "#stack" },
  { n: "03", key: "audit", href: "#auditoria" },
  { n: "04", key: "about", href: "#about" },
  { n: "05", key: "contact", href: "#contato" },
] as const;

/*
 * Hero: "desenho feito de código" + "veja por baixo da superfície".
 *
 * Camadas (de baixo para cima):
 *   0–1  HeroLayer surface: FULL-STACK / DEVELOPER + fallback estático
 *        (retrato e, atrás dele, a Enigma em glifos finos)
 *   2    canvas WebGL: o retrato em ASCII ao vivo
 *   3    HeroLayer under: mesmo layout, fundo escuro, FULL-STACK / PENTESTER
 *        em âmbar e a foto; recortada por clip-path: circle() nas variáveis
 *        --lx/--ly/--lr, que o loop do canvas escreve 1× por frame
 *   4    metadados e navegação
 */
export async function Hero() {
  const portrait = await getPortrait();
  const enigma = SHOW_ENIGMA ? await getEnigma() : undefined;
  const locale = await getLocale();
  const t = await getTranslations("hero");
  const tn = await getTranslations("nav");
  const tl = await getTranslations("lang");

  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="hero relative isolate overflow-hidden bg-paper text-ink"
      style={{ "--pa": portrait.aspect } as CSSProperties}
    >
      <h1 id="hero-title" className="sr-only">
        {t("h1", { name: profile.name })}
      </h1>

      {/* 0–1 · superfície: tipografia + fallback estático do retrato */}
      <HeroLayer variant="surface" portrait={portrait} bg={enigma} alt={t("asciiAlt", { name: profile.name })} />

      {/* intro (1ª carga da sessão): papel sobre a tipografia até o canvas da
          intro assumir. O texto embaixo está pintado desde o 1º frame (LCP). */}
      <div className="hero-intro-cover" aria-hidden="true" />

      {/* 2 · retrato ASCII ao vivo (WebGL) */}
      <AsciiStage src={portrait.src} aspect={portrait.aspect} levels={portrait.levels} bg={enigma && { src: enigma.src, aspect: enigma.aspect, levels: enigma.levels }} />

      {/* 3 · por baixo da superfície, recortada pela lente (clip-path + vars CSS) */}
      <HeroLayer variant="under" portrait={portrait} bg={enigma} alt="" />
      <div className="lens-ring" aria-hidden="true" />
      {/* legenda da Enigma: só quando a lente passa sobre ela (data-enigma) */}
      {enigma && (
        <p className="hero-enigma-cap font-mono" aria-hidden="true">
          {t("enigmaCaption")}
        </p>
      )}

      {/* 4 · metadados */}
      <div className="hero-meta relative z-10 flex h-full flex-col justify-between p-4 font-mono text-[11px] tracking-wide uppercase sm:p-6 sm:text-xs">
        <div className="flex items-start justify-between gap-4">
          <div className="leading-relaxed" data-intro-item style={{ "--i": 0 } as CSSProperties}>
            <p>{profile.name}</p>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="text-ink-soft">{t("portfolio")}</span>
              <span aria-hidden="true" className="text-ink-soft">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                {t("status")}
              </span>
            </p>
          </div>
          <nav aria-label={tn("label")} className="hdr-full" data-intro-item style={{ "--i": 1 } as CSSProperties}>
            <ul className="flex gap-4 lg:gap-6">
              {nav.map((i) => (
                <li key={i.n}>
                  <a href={i.href} className="tap group inline-flex gap-1.5 hover:text-accent-ink">
                    <span className="text-ink-soft group-hover:text-accent-ink">{i.n}</span>
                    {tn(i.key)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <LangSwitch
            intro={2}
            locale={locale}
            path="/"
            label={tl("label")}
            names={{ pt: tl("pt"), en: tl("en"), es: tl("es") }}
            className="hdr-full shrink-0 md:w-24 md:justify-end"
          />
          <div className="hdr-menu shrink-0">
            <MobileMenu
              items={nav.map((i) => ({ n: i.n, label: tn(i.key), href: i.href }))}
              locale={locale}
              labels={{ menu: tn("menu"), close: tn("close"), nav: tn("label"), lang: tl("label") }}
              langNames={{ pt: tl("pt"), en: tl("en"), es: tl("es") }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 items-end gap-4 pr-32 sm:grid-cols-3 sm:pr-0">
          <dl className="leading-relaxed" data-intro-item style={{ "--i": 0 } as CSSProperties}>
            <div className="flex gap-1.5">
              <dt className="text-ink-soft">{t("location")}</dt>
              <dd>{t("place")}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-soft">{t("localTime")}</dt>
              <dd>
                <LocalTime />
              </dd>
            </div>
          </dl>
          <a href="#findings" className="hero-scroll tap hidden justify-self-center hover:text-accent-ink sm:inline-flex" data-intro-item style={{ "--i": 1 } as CSSProperties}>
            {t("scroll")} <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
