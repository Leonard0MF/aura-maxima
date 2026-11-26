import { existsSync } from "node:fs";
import path from "node:path";

import { getTranslations } from "next-intl/server";

import { audit, auditBand, auditGrade, auditScore, type AuditNode } from "@/content/audit";
import { projects, services } from "@/content/profile";
import type { Locale } from "@/i18n/routing";

/* roda no build (as páginas são SSG): o que não existe em public/ não vira link quebrado */
export const inPublic = (url: string) => existsSync(path.join(process.cwd(), "public", url.replace(/^\//, "")));

/*
 * Currículo por idioma: public/cv-pt.pdf, public/cv-en.pdf, public/cv-es.pdf.
 * TODO: adicionar os PDFs. Enquanto o do idioma não existir, usa o em
 * português; sem nenhum, o botão some.
 */
export function cvFor(locale: Locale): string | null {
  return [`/cv-${locale}.pdf`, "/cv-pt.pdf"].find(inPublic) ?? null;
}

/* linhas do scan (terminal e imagem OG) */
export async function scanLines(locale: Locale): Promise<{ label: string; result: string }[]> {
  const t = await getTranslations({ locale, namespace: "scan" });
  const m = await getTranslations({ locale, namespace: "services" });
  const open = services.filter((s) => s.state === "open").reduce((n, s) => n + (m.raw(`${s.id}.items`) as string[]).length, 0);
  return [
    { label: t("resolving"), result: "ok" },
    { label: t("enumerating"), result: t("services", { count: open }) },
    { label: t("projects"), result: t("findings", { count: projects.length }) },
    /* vem da auditoria real; sem nota, mostra "pending" em vez de inventar */
    { label: t("posture"), result: auditGrade ?? t("pending") },
  ];
}

/* nós da constelação no idioma: os do audit.json + a nota geral */
export async function auditView(locale: Locale) {
  const t = await getTranslations({ locale, namespace: "audit" });
  const labels = t.raw("labels") as Record<string, string>;
  const examples = t.raw("exampleValues") as Record<string, string>;
  const nodes: AuditNode[] = audit.nodes.map((n) => {
    let value = n.value;
    if (audit.example) {
      const rest = examples[n.id] ?? value.replace(/^EXEMPLO · /, "");
      value = `${t("examplePrefix")} · ${rest}`;
    }
    return { ...n, label: labels[n.id] ?? n.label, value };
  });
  nodes.push({
    id: "grade",
    label: t("overall"),
    value: auditGrade
      ? [`${auditGrade} · ${auditScore ?? "—"}/100`, auditBand && t(`band.${auditBand}`)].filter(Boolean).join(" · ")
      : audit.example ? t("overallExample") : t("overallPending"),
    status: "info",
  });
  const date = audit.scannedAt ? new Date(audit.scannedAt).toLocaleDateString(locale === "pt" ? "pt-BR" : locale, { timeZone: "UTC" }) : null;
  return { nodes, date };
}
