import { getTranslations } from "next-intl/server";

import { SectionHead } from "@/components/SectionHead";
import { profile } from "@/content/profile";

const isTodo = (s: string) => /TODO/.test(s);

/* 05 · CONTACT (cabe em 100svh). Canais com TODO (e-mail, LinkedIn) não aparecem até existirem. */
export async function Contact() {
  const t = await getTranslations();
  const newTab = t("common.newTab");
  const { contact } = profile;
  const email = isTodo(contact.email) ? null : contact.email;
  const linkedin = isTodo(contact.linkedin) ? null : contact.linkedin;

  return (
    <section id="contato" aria-labelledby="contact-title" className="bg-paper text-ink">
      <SectionHead n="05" label={t("nav.contact")} title={t("contact.title")} id="contact-title" meta={t("hero.status")}>
        {t("contact.lede")}
      </SectionHead>

      <div className="sec-end px-4 sm:px-6">
        <div className="flex flex-col gap-5 border-t border-ink/20 pt-6">
          {email ? (
            /* quebra de preferência logo depois do @ (e onde mais precisar), nunca estoura a largura */
            <a href={`mailto:${email}`} className="contact-big contact-wrap w-fit">
              {email.split("@")[0]}
              <wbr />@{email.split("@")[1]}
            </a>
          ) : (
            <a href={contact.github} target="_blank" rel="noopener noreferrer" className="contact-big contact-wrap w-fit">
              github.com/{contact.githubHandle}
              <span className="sr-only">{newTab}</span>
            </a>
          )}
          <p className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs tracking-wide uppercase sm:text-sm">
            {linkedin && (
              <a href={linkedin} target="_blank" rel="noopener noreferrer" className="tap ulink">
                LinkedIn <span aria-hidden="true">↗</span>
                <span className="sr-only">{newTab}</span>
              </a>
            )}
            {email && (
              <a href={contact.github} target="_blank" rel="noopener noreferrer" className="tap ulink">
                GitHub <span aria-hidden="true">↗</span>
                <span className="sr-only">{newTab}</span>
              </a>
            )}
          </p>
        </div>
        <p className="mt-10 font-mono text-xs tracking-wide sm:text-sm">
          <span className="text-[#17633a]">[✓]</span> {t("contact.done")}
        </p>
      </div>
    </section>
  );
}
