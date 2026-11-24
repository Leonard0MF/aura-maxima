import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { projects } from "@/content/profile";

import { FindingCard } from "./FindingCard";

export function Findings() {
  return (
    <section aria-labelledby="findings" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading
        id="findings"
        index="02 · Projetos"
        command="recon --findings --sort=severity"
        title="Findings"
        lead="Projetos selecionados. Cada um tem um estudo de caso com problema, solução e decisões de segurança."
      />
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p, i) => (
          <li key={p.id} className={p.severity === "critical" ? "md:col-span-2 lg:col-span-1" : undefined}>
            <Reveal delay={i * 0.05} className="h-full">
              <FindingCard project={p} />
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
