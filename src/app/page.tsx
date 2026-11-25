import { ConsoleFlag } from "@/components/ConsoleFlag";
import { RevealObserver } from "@/components/RevealObserver";
import { SiteFooter } from "@/components/SiteFooter";
import { TerminalDock } from "@/components/TerminalDock";
import { Audit } from "@/components/sections/Audit";
import { Activity } from "@/components/sections/Activity";
import { Contact } from "@/components/sections/Contact";
import { Hero } from "@/components/sections/Hero";
import { Metrics } from "@/components/sections/Metrics";
import { Services } from "@/components/sections/Services";
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
        <Services />
        <Metrics />
        <Activity />
        <Contact />
      </main>
      <SiteFooter />
      <TerminalDock data={terminalData} />
      <ConsoleFlag />
      <RevealObserver />
    </>
  );
}
