import { getTranslations } from "next-intl/server";

import { enigma } from "@/content/enigma";
import { profile } from "@/content/profile";

import { SecurityBadge } from "./SecurityBadge";

export async function SiteFooter() {
  const t = await getTranslations();
  const c = enigma.credit;
  return (
    <footer className="border-t border-ink/20 bg-paper text-ink">
      <div className="flex flex-col gap-3 px-4 py-6 font-mono text-[11px] tracking-wide uppercase sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:text-xs">
        <SecurityBadge />
        <p className="text-ink-soft">
          © {new Date().getFullYear()} {profile.fullName}
        </p>
      </div>
      {/* crédito exigido pela licença da foto de fundo do hero (CREDITS.md) */}
      <p className="footer-credit px-4 pb-5 font-mono text-[10.5px] tracking-wide text-ink-soft sm:px-6">
        {t("footer.enigmaCredit")}:{" "}
        <a href={c.source} target="_blank" rel="noopener noreferrer" className="ulink">
          {c.author}, Wikimedia Commons
          <span className="sr-only">{t("common.newTab")}</span>
        </a>{" "}
        ·{" "}
        <a href={c.licenseUrl} target="_blank" rel="license noopener noreferrer" className="ulink">
          {c.license}
          <span className="sr-only">{t("common.newTab")}</span>
        </a>
      </p>
    </footer>
  );
}
