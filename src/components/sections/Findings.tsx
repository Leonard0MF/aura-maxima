import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { projects } from "@/content/profile";

import { FeaturedFinding, FindingCard } from "./FindingCard";

/* Bento: o finding CRITICAL ocupa a largura toda; os demais, lado a lado. */
export function Findings() {
  const [featured, ...rest] = [...projects].sort((a, b) => (a.severity === "critical" ? -1 : b.severity === "critical" ? 1 : 0));
  return (
    <section aria-labelledby="findings" className="mx-auto max-w-[75rem] px-4 py-14 sm:px-6">
      <SectionHeading
        id="findings"
        index="Projetos"
        command="recon --findings --sort=severity"
        title="Findings"
        lead="Projetos selecionados, cada um com estudo de caso: problema, solução e decisões de segurança."
      />
      <ul className="grid gap-4 md:grid-cols-2">
        <li className="md:col-span-2">
          <Reveal className="h-full">
            <FeaturedFinding project={featured} />
          </Reveal>
        </li>
        {rest.map((p, i) => (
          <li key={p.id}>
            <Reveal delay={i * 0.05} className="h-full">
              <FindingCard project={p} />
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
