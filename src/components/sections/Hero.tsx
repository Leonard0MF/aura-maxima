import type { CSSProperties } from "react";

import { AsciiStage } from "@/components/hero/AsciiStage";
import { LocalTime } from "@/components/hero/LocalTime";
import { profile } from "@/content/profile";
import { getPortrait } from "@/lib/ascii/image";
import { t } from "@/lib/i18n";

const nav = [
  { n: "01", label: "Work", href: "#findings" },
  { n: "02", label: "Stack", href: "#stack" },
  { n: "03", label: "Hack me", href: "#hackme" },
  { n: "04", label: "Audit", href: "#auditoria" },
  { n: "05", label: "About", href: "#about" },
  { n: "06", label: "Contact", href: "#contato" },
];

/*
 * Hero: "desenho feito de código" + "veja por baixo da superfície".
 *
 * Camadas (de baixo para cima):
 *   0  tipografia display: FULL-STACK / DEVELOPER
 *   1  fallback estático: o retrato em ASCII gerado no build (<pre>), visível
 *      só sem JS, com reduced-motion ou se o WebGL falhar
 *   2  canvas WebGL: o retrato em ASCII ao vivo (cobre a tipografia onde há
 *      rosto) e, dentro da lente, a foto real
 *      dentro da lente, também desenha FULL-STACK / PENTESTER em mono (textura)
 *   3  metadados e navegação
 */
export async function Hero() {
  const portrait = await getPortrait();

  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="hero relative isolate overflow-hidden bg-paper text-ink"
      style={{ "--pa": portrait.aspect } as CSSProperties}
    >
      <h1 id="hero-title" className="sr-only">
        {profile.name}, Full-Stack Developer &amp; Pentester
      </h1>

      {/* 0 · tipografia */}
      <div aria-hidden="true" className="hero-display font-display text-ink">
        <span className="hl hl-top">FULL-STACK</span>
        <span className="hl hl-bot">DEVELOPER</span>
      </div>

      {/* 1 · fallback estático (SVG gerado no build) */}
      <div className="ascii-fallback">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado no build, nada a otimizar */}
        <img
          src={portrait.svg.src}
          width={portrait.svg.width}
          height={portrait.svg.height}
          alt={`Retrato de ${profile.name} desenhado com caracteres de código (ASCII art)`}
          decoding="async"
        />
      </div>

      {/* 2 · retrato ao vivo */}
      <AsciiStage src={portrait.src} aspect={portrait.aspect} levels={portrait.levels} />

      {/* 3 · metadados */}
      <div className="hero-meta relative z-10 flex h-full flex-col justify-between p-4 font-mono text-[11px] tracking-wide uppercase sm:p-6 sm:text-xs">
        <div className="flex items-start justify-between gap-4">
          <div className="leading-relaxed">
            <p>{profile.name}</p>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="text-ink-soft">Portfolio 2026</span>
              <span aria-hidden="true" className="text-ink-soft">·</span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                {t(profile.status).split(" ")[0]}
              </span>
            </p>
          </div>
          <nav aria-label="Seções" className="hidden md:block">
            <ul className="flex gap-4 lg:gap-6">
              {nav.map((i) => (
                <li key={i.n}>
                  <a href={i.href} className="group inline-flex gap-1.5 hover:text-accent-ink">
                    <span className="text-ink-soft group-hover:text-accent-ink">{i.n}</span>
                    {i.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <span aria-hidden="true" className="hidden w-24 md:block" />
        </div>

        <div className="grid grid-cols-1 items-end gap-4 pr-32 sm:grid-cols-3 sm:pr-0">
          <dl className="leading-relaxed">
            <div className="flex gap-1.5">
              <dt className="text-ink-soft">Location:</dt>
              <dd>{t(profile.location)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-soft">Local time:</dt>
              <dd>
                <LocalTime />
              </dd>
            </div>
          </dl>
          <a href="#findings" className="hidden justify-self-center hover:text-accent-ink sm:block">
            (Scroll) <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
