import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { profile } from "@/content/profile";
import { routing } from "@/i18n/routing";

import { FlagForm, type FlagStrings } from "./FlagForm";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: "/flag", description: t("flagDescription"), robots: { index: false, follow: false } };
}

export default async function FlagPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations();
  const strings: FlagStrings = {
    hints: t.raw("ctf.hints") as string[],
    flag: t.raw("ctf.flag") as string,
    hint: t.raw("ctf.hint") as string,
    submit: t("ctf.submit"),
    wrong: t.raw("ctf.wrong") as string,
    win: t("ctf.win"),
    newTab: t("common.newTab"),
  };

  return (
    <main id="conteudo" className="mx-auto min-h-dvh max-w-2xl px-4 py-16 sm:py-24">
      <p className="font-mono text-sm text-dim">
        <span className="text-accent">$</span> submit --flags 3
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">{t("ctf.title")}</h1>
      <p className="mt-3 text-muted">
        {t.rich("ctf.intro", { format: "LEO{...}", code: (c) => <code className="font-mono text-accent">{c}</code> })}
      </p>
      <FlagForm strings={strings} contact={{ email: profile.contact.email, linkedin: profile.contact.linkedin, github: profile.contact.github }} />
    </main>
  );
}
