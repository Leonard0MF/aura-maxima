import { getTranslations } from "next-intl/server";

import { SectionHead } from "@/components/SectionHead";
import { profile } from "@/content/profile";

/* 05 · CONTACT (cabe em 100svh): e-mail em destaque; LinkedIn e GitHub logo abaixo. */
export async function Contact() {
  const t = await getTranslations();
  const newTab = t("common.newTab");
  const { email, linkedin, github } = profile.contact;
  const [user, domain] = email.split("@");

  return (
    <section id="contato" aria-labelledby="contact-title" className="bg-paper text-ink">
      <SectionHead n="05" label={t("nav.contact")} title={t("contact.title")} id="contact-title" meta={t("hero.status")}>
        {t("contact.lede")}
      </SectionHead>

      <div className="sec-end px-4 sm:px-6">
        <div className="flex flex-col gap-5 border-t border-ink/20 pt-6">
          {/* quebra de preferência logo depois do @, nunca estoura a largura */}
          <a href={`mailto:${email}`} className="contact-big contact-wrap w-fit">
            {user}
            <wbr />@{domain}
          </a>
          <p className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-xs tracking-wide uppercase sm:text-sm">
            <a href={linkedin} target="_blank" rel="noopener noreferrer me" className="tap ulink">
              LinkedIn <span aria-hidden="true">↗</span>
              <span className="sr-only">{newTab}</span>
            </a>
            <a href={github} target="_blank" rel="noopener noreferrer me" className="tap ulink">
              GitHub <span aria-hidden="true">↗</span>
              <span className="sr-only">{newTab}</span>
            </a>
          </p>
        </div>
        <p className="mt-10 font-mono text-xs tracking-wide sm:text-sm">
          <span className="text-[#17633a]">[✓]</span> {t("contact.done")}
        </p>
      </div>
    </section>
  );
}
