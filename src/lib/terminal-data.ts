import { getTranslations } from "next-intl/server";

import type { TerminalData, TerminalStrings } from "@/components/terminal/types";
import { profile, projects, services } from "@/content/profile";
import { localePath, type Locale } from "@/i18n/routing";

import { cvFor, scanLines } from "./site";

/* Só o necessário para o terminal, já no idioma (vai no payload RSC, não no bundle). */
export async function terminalData(locale: Locale): Promise<TerminalData> {
  const t = await getTranslations({ locale });
  return {
    name: profile.name,
    strings: t.raw("terminal") as TerminalStrings,
    projects: projects.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      kind: p.kind,
      label: t(`work.kinds.${p.kind}`),
      summary: t(`projects.${p.slug}.summary`),
      stack: p.stack.map((s) => (typeof s === "string" ? s : t(`projects.${p.slug}.stack.${s.key}`))),
      href: localePath(locale, `/projetos/${p.slug}`),
      repo: p.links.repo,
      demo: p.links.demo,
    })),
    skills: services.map((g) => ({ port: g.port, title: t(`services.${g.id}.term`), state: g.state, items: t.raw(`services.${g.id}.items`) as string[] })),
    contact: { email: profile.contact.email, linkedin: profile.contact.linkedin, github: profile.contact.github },
    cv: cvFor(locale),
    scan: await scanLines(locale),
  };
}
