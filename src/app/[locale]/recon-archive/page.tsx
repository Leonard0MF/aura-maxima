import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { localePath, routing } from "@/i18n/routing";

export const metadata: Metadata = {
  title: "recon-archive",
  robots: { index: false, follow: false },
};

/* CTF · flag 3 de 3. Quem lê o robots.txt chega aqui. */
export default async function ReconArchive({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("ctf");
  return (
    <main id="conteudo" className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-4 font-mono">
      <p className="text-sm text-dim">
        <span className="text-accent">$</span> cat /recon-archive/README
      </p>
      <h1 className="mt-3 text-2xl text-fg">{t("archiveTitle")}</h1>
      <p className="mt-4 text-muted">
        Flag 3/3: <code className="text-accent">LEO{"{robots_txt_is_a_map}"}</code>
      </p>
      <Link href={localePath(locale, "/flag")} className="mt-8 text-sm text-accent hover:underline">
        {t("archiveSend")} →
      </Link>
    </main>
  );
}
