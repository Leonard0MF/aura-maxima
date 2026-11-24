import { profile } from "@/content/profile";

import { SecurityBadge } from "./SecurityBadge";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <SecurityBadge />
        <p className="font-mono text-xs text-dim">
          © {new Date().getFullYear()} {profile.fullName}
        </p>
      </div>
    </footer>
  );
}
