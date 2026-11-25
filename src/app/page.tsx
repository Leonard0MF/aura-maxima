import { ConsoleFlag } from "@/components/ConsoleFlag";
import { SiteFooter } from "@/components/SiteFooter";
import { TerminalDock } from "@/components/TerminalDock";
import { About } from "@/components/sections/About";
import { Audit } from "@/components/sections/Audit";
import { Contact } from "@/components/sections/Contact";
import { Hero } from "@/components/sections/Hero";
import { Stack } from "@/components/sections/Stack";
import { Work } from "@/components/sections/Work";
import { terminalData } from "@/lib/terminal-data";

export default function Home() {
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
      <TerminalDock data={terminalData} />
      <ConsoleFlag />
    </>
  );
}
