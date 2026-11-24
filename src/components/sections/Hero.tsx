import Image from "next/image";

import { Dual } from "@/components/Dual";
import { LensController } from "@/components/hero/LensController";
import { LocalTime } from "@/components/hero/LocalTime";
import { OrbStage } from "@/components/hero/OrbStage";
import { ModeToggle } from "@/components/ModeToggle";
import { profile } from "@/content/profile";
import { t } from "@/lib/i18n";

const nav = [
  { n: "01", label: "Work", href: "#findings" },
  { n: "02", label: "Audit", href: "#auditoria" },
  { n: "03", label: "About", href: "#historico" },
  { n: "04", label: "Contact", href: "#contato" },
];

/*
 * Hero editorial: "veja por baixo da superfície".
 *
 * Camadas (de baixo para cima):
 *   0  superfície: fundo claro + tipografia display
 *   1  janela da lente: fundo escuro, código esmaecido, tipografia mono
 *      (um círculo que se move via transform; o conteúdo interno faz a
 *      contra-translação, então tudo é compositado, sem repaint)
 *   2  canvas WebGL: vidro âmbar fora da lente, wireframe dentro
 *   3  aro da lente
 *   4  metadados e navegação
 */
export function Hero() {
  return (
    <section id="hero" aria-labelledby="hero-title" className="hero relative isolate overflow-hidden bg-paper text-ink">
      <h1 id="hero-title" className="sr-only">
        {profile.name}, Full-Stack Developer &amp; Pentester
      </h1>

      {/* 0 · superfície */}
      <div aria-hidden="true" className="hero-display font-display text-ink">
        <span className="hl hl-top">FULL-STACK</span>
        <span className="hl hl-bot">DEVELOPER</span>
      </div>

      {/* fallback estático (sem WebGL / reduced-motion / aparelho fraco) */}
      <div aria-hidden="true" className="orb-static">
        <Image src="/hero/orb.webp" alt="" width={720} height={720} sizes="(min-width: 768px) 60vh, 78vw" />
      </div>

      {/* 1 · janela da lente */}
      <div aria-hidden="true" className="lens-window">
        <div className="lens-inner">
          <div className="lens-code" />
          <div className="hero-display font-mono font-bold">
            <span className="hl hl-top hl-mono text-paper">FULL-STACK</span>
            <span className="hl hl-bot hl-mono text-accent">
              <Dual term="PENTESTER" clean="SECURITY" />
            </span>
          </div>
          <div className="orb-static orb-static-wire">
            <Image src="/hero/orb-wire.webp" alt="" width={720} height={720} sizes="(min-width: 768px) 60vh, 78vw" />
          </div>
        </div>
      </div>

      {/* 2 · objeto 3D */}
      <OrbStage />

      {/* 3 · aro */}
      <div aria-hidden="true" className="lens-ring">
        <span className="lens-tick" />
      </div>

      {/* 4 · metadados */}
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
            <ul className="flex gap-6">
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
          <ModeToggle tone="light" />
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
          <a href="#auditoria" className="hidden justify-self-center hover:text-accent-ink sm:block">
            (Scroll) <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>

      <LensController targetId="hero" />
    </section>
  );
}
