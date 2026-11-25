import Link from "next/link";
import type { CSSProperties } from "react";

import { Decrypt } from "@/components/Decrypt";
import { Dual } from "@/components/Dual";
import { WorkAscii } from "@/components/work/WorkAscii";
import { projects, type Project } from "@/content/profile";
import { getAsciiImage } from "@/lib/ascii/image";
import { t } from "@/lib/i18n";

/* largura de cada nome em em (Archivo Black, tracking −0.035em), medida no
 * navegador; o nome ocupa a largura útil do bloco */
const WIDTH_EM: Record<string, number> = { AEGIS: 3.269, BUMPHUB: 5.45, FOTOS: 3.542 };

const known = (s?: string) => (s && !s.startsWith("TODO") ? s : undefined);
const pad = (n: number) => String(n).padStart(2, "0");

/*
 * 01 · WORK. Um projeto por bloco de 100svh, sticky (empilham ao rolar).
 * Camadas do bloco:
 *   0  ASCII estático (SVG do build): sem JS, modo estático ou fora de cena
 *   1  canvas WebGL do print (só o bloco em cena), com a lente na imagem real
 *   2  nome gigante com mix-blend-mode: difference → inverte onde o ASCII
 *      passa por baixo das letras; recortado no círculo da lente
 *   3  metadados nos cantos
 */
export async function Work() {
  const list = await Promise.all(
    projects.map(async (p) => ({ p, img: await getAsciiImage(p.image?.src ?? "projects/placeholder.png") })),
  );

  return (
    <section id="findings" aria-labelledby="work-title" className="work bg-paper text-ink">
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

      <ol>
        {list.map(({ p, img }, i) => (
          <WorkBlock key={p.id} p={p} img={img} i={i} total={list.length} />
        ))}
      </ol>
    </section>
  );
}

function WorkBlock({
  p,
  img,
  i,
  total,
}: {
  p: Project;
  img: Awaited<ReturnType<typeof getAsciiImage>>;
  i: number;
  total: number;
}) {
  const stack = p.stack.filter((s) => known(s));
  const alt = p.image ? t(p.image.alt) : `Placeholder neutro: print de ${p.title} ainda não disponível`;

  return (
    <li
      className="work-block"
      aria-labelledby={`w-${p.slug}`}
      style={{ "--pa": img.aspect, "--w": WIDTH_EM[p.display] ?? p.display.length * 0.72, zIndex: i + 1 } as CSSProperties}
    >
      <div className="ascii-fallback">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerado no build */}
        <img src={img.svg.src} width={img.svg.width} height={img.svg.height} alt={`${alt} (ASCII art)`} decoding="async" />
      </div>

      <WorkAscii src={img.src} aspect={img.aspect} levels={img.levels} />

      <div className="work-name">
        <h3 id={`w-${p.slug}`} className="font-display">
          <span className="sr-only">{p.title}</span>
          <span aria-hidden="true">{p.display}</span>
        </h3>
      </div>

      <div className="work-meta">
        <div className="flex items-start justify-between gap-4">
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

        <div className="grid items-end gap-4 pr-28 sm:grid-cols-[minmax(0,1fr)_auto] sm:pr-36">
          <div className="space-y-3">
            <p className="max-w-[44ch] font-sans text-sm leading-relaxed tracking-normal normal-case sm:text-[15px]">{t(p.summary)}</p>
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              {stack.length > 0 && (
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Stack</dt>
                  <dd>{stack.join(" · ")}</dd>
                </div>
              )}
              {known(p.year) && (
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Ano</dt>
                  <dd>{p.year}</dd>
                </div>
              )}
              {p.role && (
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Papel</dt>
                  <dd>{t(p.role)}</dd>
                </div>
              )}
            </dl>
          </div>
          <p className="flex gap-5">
            <Link href={`/projetos/${p.slug}`} className="ulink">
              Estudo de caso <span aria-hidden="true">→</span>
            </Link>
            {p.links.repo && (
              <a href={p.links.repo} target="_blank" rel="noreferrer" className="ulink">
                Repo <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            )}
          </p>
        </div>
      </div>
    </li>
  );
}
