import Link from "next/link";

import { profile } from "@/content/profile";

/* Cabeçalho das páginas internas (estudos de caso), no sistema editorial. */
export function SiteHeader() {
  return (
    <header className="flex items-start justify-between gap-4 bg-paper px-4 py-4 font-mono text-[11px] tracking-wide text-ink uppercase sm:px-6 sm:text-xs">
      <Link href="/" className="ulink">
        {profile.name}
      </Link>
      <Link href="/#findings" className="ulink">
        ← Work
      </Link>
    </header>
  );
}
