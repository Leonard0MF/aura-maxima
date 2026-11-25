import { AsciiStage } from "@/components/hero/AsciiStage";
import { LocalTime } from "@/components/hero/LocalTime";
import { ModeToggle } from "@/components/ModeToggle";
import { profile } from "@/content/profile";
import { FIT, GRID } from "@/lib/ascii/core";
import { getPortrait } from "@/lib/ascii/portrait";
import { t } from "@/lib/i18n";

const nav = [
  { n: "01", label: "Work", href: "#findings" },
  { n: "02", label: "Audit", href: "#auditoria" },
  { n: "03", label: "About", href: "#historico" },
  { n: "04", label: "Contact", href: "#contato" },
];

/*
 * Hero: "desenho feito de código". O retrato é texto ASCII gerado no build
 * (primeira pintura, LCP e fallback); depois do paint, um canvas WebGL entra
 * por cima com a mesma grade e dá vida: tremulação, embaralhamento perto do
 * cursor e a lente que mostra a foto por trás do código.
 */
export async function Hero() {
  const portrait = await getPortrait();

  return (
    <section id="hero" aria-labelledby="hero-title" data-name="display" className="hero relative isolate overflow-hidden bg-paper text-ink">
      <div className="hero-bar flex items-start justify-between gap-4 font-mono text-[11px] tracking-wide uppercase sm:text-xs">
        <p className="leading-relaxed">
          {profile.name} <span className="text-ink-soft">/ Portfolio 2026</span>
        </p>
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

      <div className="hero-head">
        <p className="mb-3 font-mono text-[11px] tracking-wide text-ink-soft uppercase sm:text-xs">(Index) — recon --target</p>
        <h1 id="hero-title" className="hero-title">
          <span className="hero-name">
            <span className="block">{profile.name.split(" ")[0]}</span>
            <span className="block">{profile.name.split(" ").slice(1).join(" ")}</span>
          </span>
          <span className="sr-only">, </span>
          <span className="mt-4 block font-mono text-sm font-medium sm:text-base">
            Full-Stack Developer &amp; <span className="text-accent-ink">Pentester</span>
          </span>
        </h1>
      </div>

      <div
        className="hero-portrait ascii-box"
        style={{ aspectRatio: `${portrait.aspect / FIT}` }}
        role="img"
        aria-label={`Retrato de ${profile.name} desenhado com caracteres de código (ASCII art)`}
      >
        <pre aria-hidden="true" className="ascii-pre ascii-wide" style={{ fontSize: `calc(100cqw / ${GRID.wide * 0.6})` }}>
          {portrait.wide}
        </pre>
        <pre aria-hidden="true" className="ascii-pre ascii-narrow" style={{ fontSize: `calc(100cqw / ${GRID.narrow * 0.6})` }}>
          {portrait.narrow}
        </pre>
        <AsciiStage src={portrait.src} aspect={portrait.aspect} />
      </div>

      <div className="hero-foot font-mono text-[11px] tracking-wide uppercase sm:text-xs">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 leading-relaxed">
          <dt className="text-ink-soft">Local</dt>
          <dd>{t(profile.location)}</dd>
          <dt className="text-ink-soft">Hora local</dt>
          <dd>
            <LocalTime />
          </dd>
          <dt className="text-ink-soft">Status</dt>
          <dd className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            {t(profile.status)}
          </dd>
        </dl>
        <div className="mt-6 flex flex-wrap items-center gap-3 normal-case">
          <a href="#findings" className="inline-flex h-11 items-center gap-2 bg-ink px-5 text-paper hover:bg-accent-ink">
            Ver projetos <span aria-hidden="true">↓</span>
          </a>
          <a href={profile.contact.cv} className="inline-flex h-11 items-center gap-2 border border-ink px-5 hover:border-accent-ink hover:text-accent-ink">
            Currículo <span aria-hidden="true">↗</span>
          </a>
          <a href="#findings" className="ml-auto hidden text-ink-soft uppercase hover:text-accent-ink lg:inline">
            (Scroll) <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>
    </section>
  );
}
