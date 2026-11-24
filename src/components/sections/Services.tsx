import { Dual } from "@/components/Dual";
import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { services } from "@/content/profile";
import { t } from "@/lib/i18n";

/* Grid compacto: em lg, 3 colunas (security ocupa 2 na 2ª linha). */
const span: Record<string, string> = {
  security: "lg:col-span-2",
  exploring: "sm:col-span-2 lg:col-span-1",
};

export function Services() {
  return (
    <section aria-labelledby="servicos" className="mx-auto max-w-[75rem] px-4 py-14 sm:px-6">
      <SectionHeading
        id="servicos"
        index="Stack"
        command="nmap -sV leo --top-ports"
        title="Serviços expostos"
        lead="Tecnologias que uso no dia a dia, agrupadas por área."
      />
      <Reveal className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {services.map((group) => (
          <div key={group.id} className={`bg-bg p-5 ${span[group.id] ?? ""}`}>
            <h3 className="mb-3 flex items-baseline justify-between gap-3 font-mono text-[13px]">
              <span className="text-fg">
                <Dual term={<><span className="text-dim">{group.port}</span> {t(group.title.term)}</>} clean={t(group.title.clean)} />
              </span>
              <span className={`t-term text-[11px] ${group.state === "open" ? "text-ok" : "text-accent"}`}>{group.state}</span>
            </h3>
            <ul className={`grid grid-cols-2 gap-x-4 font-mono text-[12.5px] leading-6 text-muted ${group.id === "security" ? "lg:grid-cols-3" : ""}`}>
              {group.items.map((item) => (
                <li key={item} className="flex min-w-0 gap-2">
                  <span aria-hidden="true" className="t-term shrink-0 text-dim">
                    {group.state === "open" ? "›" : "·"}
                  </span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
