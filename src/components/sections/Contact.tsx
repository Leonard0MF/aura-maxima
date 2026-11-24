import { Dual } from "@/components/Dual";
import { SectionHeading } from "@/components/SectionHeading";
import { profile } from "@/content/profile";

export function Contact() {
  const { contact } = profile;
  const rows = [
    { key: "email", label: "E-mail", href: `mailto:${contact.email}`, value: contact.email, external: false },
    { key: "linkedin", label: "LinkedIn", href: contact.linkedin, value: contact.linkedin.replace("https://www.", ""), external: true },
    { key: "github", label: "GitHub", href: contact.github, value: `github.com/${contact.githubHandle}`, external: true },
  ];
  return (
    <section aria-labelledby="contato" className="mx-auto max-w-[75rem] px-4 py-14 sm:px-6">
      <SectionHeading
        id="contato"
        index="Contato"
        command="connect --to leo"
        title="Vamos conversar"
        lead="Aberto a oportunidades como dev full-stack com foco em segurança."
      />
      <div className="max-w-2xl rounded-lg border border-line bg-surface p-5 font-mono text-sm sm:p-6">
        <p className="t-term mb-4 text-dim">
          <span className="text-ok">[✓]</span> connection established · choose a channel
        </p>
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
              <span className="w-24 shrink-0 text-dim">
                <Dual term={r.key} clean={r.label} />
              </span>
              <a
                href={r.href}
                {...(r.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="break-all text-fg underline decoration-line underline-offset-4 hover:text-accent"
              >
                {r.value}
                {r.external ? <span className="sr-only"> (abre em nova aba)</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
