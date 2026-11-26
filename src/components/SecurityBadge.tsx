import { getTranslations } from "next-intl/server";

import { SITE_URL, profile } from "@/content/profile";

const host = new URL(SITE_URL).host;

/* Apenas links: o site não escaneia nada por conta própria. */
export async function SecurityBadge() {
  const t = await getTranslations();
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-[#1f7a43]" />
      <span>{t("footer.headers")}</span>
      <a href={`https://securityheaders.com/?q=${encodeURIComponent(host)}&followRedirects=on`} target="_blank" rel="noopener noreferrer" className="tap ulink">
        {t("footer.verify")} <span aria-hidden="true">↗</span>
        <span className="sr-only">{t("footer.verifySr")}</span>
      </a>
      <a href={profile.aegisUrl} target="_blank" rel="noopener noreferrer" className="tap ulink">
        Aegis <span aria-hidden="true">↗</span>
        <span className="sr-only">{t("common.newTab")}</span>
      </a>
    </p>
  );
}
