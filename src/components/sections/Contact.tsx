import { Decrypt } from "@/components/Decrypt";
import { profile } from "@/content/profile";

const isTodo = (s: string) => /TODO/.test(s);

/* 06 · CONTACT. Canais com TODO (e-mail, LinkedIn) não aparecem até existirem. */
export function Contact() {
  const { contact } = profile;
  const email = isTodo(contact.email) ? null : contact.email;
  const linkedin = isTodo(contact.linkedin) ? null : contact.linkedin;

  return (
    <section id="contato" aria-labelledby="contact-title" className="bg-paper text-ink">
      <header className="sec-head">
        <div className="sec-meta">
          <span>06</span>
          <span className="text-ink-soft">connect --to leo</span>
          <span>{profile.status.pt}</span>
        </div>
        <h2 id="contact-title" className="contact-title font-display">
          <Decrypt text="VAMOS" />
          <br />
          <Decrypt text="CONVERSAR" />
        </h2>
      </header>

      <div className="px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="flex flex-col gap-6 border-t border-ink/20 pt-8">
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
        <p className="mt-16 font-mono text-xs tracking-wide sm:text-sm">
          <span className="text-[#1f7a43]">[✓]</span> scan complete · 0 vulnerabilidades críticas no candidato
        </p>
      </div>
    </section>
  );
}
