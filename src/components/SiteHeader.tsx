import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { LangSwitch } from "@/components/LangSwitch";
import { profile } from "@/content/profile";
import { localePath } from "@/i18n/routing";

/* Cabeçalho das páginas internas (estudos de caso), no sistema editorial. */
export async function SiteHeader({ path }: { path: string }) {
  const locale = await getLocale();
  const t = await getTranslations();
  return (
    <header className="flex items-start justify-between gap-4 bg-paper px-4 py-4 font-mono text-[11px] tracking-wide text-ink uppercase sm:px-6 sm:text-xs">
      <Link href={localePath(locale)} className="ulink">
        {profile.name}
      </Link>
      <div className="flex items-start gap-6">
        <LangSwitch locale={locale} path={path} label={t("lang.label")} names={{ pt: t("lang.pt"), en: t("lang.en"), es: t("lang.es") }} />
        <Link href={`${localePath(locale)}#findings`} className="ulink">
          ← {t("nav.back")}
        </Link>
      </div>
    </header>
  );
}
