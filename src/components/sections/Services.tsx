import { Dual } from "@/components/Dual";
import { Reveal } from "@/components/Reveal";
import { SectionHeading } from "@/components/SectionHeading";
import { services } from "@/content/profile";
import { t } from "@/lib/i18n";

export function Services() {
  return (
    <section aria-labelledby="servicos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <SectionHeading
        id="servicos"
        index="01 · Stack"
        command="nmap -sV leo --top-ports"
        title="Serviços expostos"
        lead="Tecnologias que uso no dia a dia, agrupadas por área."
      />
      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
        {services.map((group, i) => (
          <Reveal
            key={group.id}
            delay={i * 0.04}
            className={`bg-bg p-5 sm:p-6 ${services.length % 2 === 1 && i === services.length - 1 ? "sm:col-span-2" : ""}`}
          >
            <h3 className="mb-4 flex items-baseline justify-between gap-3 font-mono text-sm">
              <span className="text-fg">
                <Dual term={<><span className="text-dim">{group.port}</span> {t(group.title.term)}</>} clean={t(group.title.clean)} />
              </span>
              <span className={`t-term text-xs ${group.state === "open" ? "text-ok" : "text-accent"}`}>{group.state}</span>
            </h3>
            <ul className="font-mono text-[13px] leading-7 text-muted">
              {group.items.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden="true" className="t-term text-dim">
                    {group.state === "open" ? "├─" : "··"}
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
