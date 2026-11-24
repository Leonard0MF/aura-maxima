import Link from "next/link";

import { profile } from "@/content/profile";

import { Dual } from "./Dual";
import { ModeToggle } from "./ModeToggle";

const nav = [
  { href: "/#servicos", term: "services", clean: "Stack" },
  { href: "/#findings", term: "findings", clean: "Projetos" },
  { href: "/#historico", term: "log", clean: "Experiência" },
  { href: "/#contato", term: "connect", clean: "Contato" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <div className="mx-auto flex h-14 max-w-[75rem] items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="font-mono text-sm font-medium text-fg hover:text-accent">
          <Dual term={<><span className="text-accent">~/</span>leo</>} clean={profile.name} />
        </Link>
        <nav aria-label="Seções" className="hidden md:block">
          <ul className="flex gap-6 font-mono text-xs text-muted">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:text-fg">
                  <Dual term={`./${n.term}`} clean={n.clean} />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ModeToggle />
      </div>
    </header>
  );
}
