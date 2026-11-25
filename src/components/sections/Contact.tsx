import { SectionHead } from "@/components/SectionHead";
import { profile } from "@/content/profile";

const isTodo = (s: string) => /TODO/.test(s);

/* 05 · CONTACT (cabe em 100svh). Canais com TODO (e-mail, LinkedIn) não aparecem até existirem. */
export function Contact() {
  const { contact } = profile;
  const email = isTodo(contact.email) ? null : contact.email;
  const linkedin = isTodo(contact.linkedin) ? null : contact.linkedin;

  return (
    <section id="contato" aria-labelledby="contact-title" className="bg-paper text-ink">
      <SectionHead n="05" label="Contact" title="Vamos conversar" id="contact-title" meta={profile.status.pt}>
        Aberto a oportunidades em cibersegurança e desenvolvimento seguro.
      </SectionHead>

      <div className="sec-end px-4 sm:px-6">
        <div className="flex flex-col gap-5 border-t border-ink/20 pt-6">
          {email ? (
            <a href={`mailto:${email}`} className="contact-big w-fit break-all">
              {email}
            </a>
          ) : (
            <a href={contact.github} target="_blank" rel="noopener noreferrer" className="contact-big w-fit break-all">
              github.com/{contact.githubHandle}
              <span className="sr-only"> (abre em nova aba)</span>
            </a>
          )}
          <p className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs tracking-wide uppercase sm:text-sm">
            {linkedin && (
              <a href={linkedin} target="_blank" rel="noopener noreferrer" className="ulink">
                LinkedIn <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            )}
            {email && (
              <a href={contact.github} target="_blank" rel="noopener noreferrer" className="ulink">
                GitHub <span aria-hidden="true">↗</span>
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            )}
          </p>
        </div>
        <p className="mt-10 font-mono text-xs tracking-wide sm:text-sm">
          <span className="text-[#17633a]">[✓]</span> scan complete · 0 vulnerabilidades críticas no candidato
        </p>
      </div>
    </section>
  );
}
