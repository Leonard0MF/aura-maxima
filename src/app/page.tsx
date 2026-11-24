import { ConsoleFlag } from "@/components/ConsoleFlag";
import { RevealObserver } from "@/components/RevealObserver";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Activity } from "@/components/sections/Activity";
import { Contact } from "@/components/sections/Contact";
import { Findings } from "@/components/sections/Findings";
import { Hero } from "@/components/sections/Hero";
import { Services } from "@/components/sections/Services";

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="conteudo">
        <Hero />
        <Services />
        <Findings />
        <Activity />
        <Contact />
      </main>
      <SiteFooter />
      <ConsoleFlag />
      <RevealObserver />
    </>
  );
}
