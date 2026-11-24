import { ConsoleFlag } from "@/components/ConsoleFlag";
import { RevealObserver } from "@/components/RevealObserver";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Audit } from "@/components/sections/Audit";
import { Activity } from "@/components/sections/Activity";
import { Contact } from "@/components/sections/Contact";
import { Findings } from "@/components/sections/Findings";
import { Hero } from "@/components/sections/Hero";
import { Metrics } from "@/components/sections/Metrics";
import { Services } from "@/components/sections/Services";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo">
        <Hero />
        <Audit />
        <Services />
        <Findings />
        <Metrics />
        <Activity />
        <Contact />
      </main>
      <SiteFooter />
      <ConsoleFlag />
      <RevealObserver />
    </>
  );
}
