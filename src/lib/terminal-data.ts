import type { TerminalData } from "@/components/terminal/types";
import { profile, projects, scanLines, services } from "@/content/profile";

import { t } from "./i18n";

/* Só o necessário para o terminal (vai no payload RSC, não no bundle). */
export const terminalData: TerminalData = {
  name: profile.name,
  whoami: profile.whoami.map((l) => t(l)),
  projects: projects.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    severity: p.severity,
    summary: t(p.summary),
    stack: p.stack,
    repo: p.links.repo,
    demo: p.links.demo,
  })),
  skills: services.map((g) => ({ port: g.port, title: t(g.title.term), state: g.state, items: g.items })),
  contact: { email: profile.contact.email, linkedin: profile.contact.linkedin, github: profile.contact.github },
  cv: profile.contact.cv,
  scan: scanLines,
};
