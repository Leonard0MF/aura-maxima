import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { ConsoleFlag } from "@/components/ConsoleFlag";
import { OffscreenPause } from "@/components/OffscreenPause";
import { SiteFooter } from "@/components/SiteFooter";
import { TerminalDock } from "@/components/TerminalDock";
import { About } from "@/components/sections/About";
import { Audit } from "@/components/sections/Audit";
import { Contact } from "@/components/sections/Contact";
import { Hero } from "@/components/sections/Hero";
import { Stack } from "@/components/sections/Stack";
import { Work } from "@/components/sections/Work";
import { routing } from "@/i18n/routing";
import { terminalData } from "@/lib/terminal-data";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("ctf");

  return (
    <>
      <main id="conteudo">
        <Hero />
        <Work />
        <Stack />
        <Audit />
        <About />
        <Contact />
      </main>
      <SiteFooter />
      <TerminalDock data={await terminalData(locale)} />
      <ConsoleFlag text={t.raw("console") as string} />
      <OffscreenPause />
    </>
  );
}
