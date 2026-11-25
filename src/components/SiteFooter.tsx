import { profile } from "@/content/profile";

import { SecurityBadge } from "./SecurityBadge";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/20 bg-paper text-ink">
      <div className="flex flex-col gap-3 px-4 py-6 font-mono text-[11px] tracking-wide uppercase sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-xs">
        <SecurityBadge />
        <p className="text-ink-soft">
          © {new Date().getFullYear()} {profile.fullName}
        </p>
      </div>
    </footer>
  );
}
