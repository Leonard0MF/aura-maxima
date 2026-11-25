import { getLocale, getTranslations } from "next-intl/server";

import { NotFoundView } from "@/components/NotFoundView";
import { localePath } from "@/i18n/routing";

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations("notFound");
  return <NotFoundView title={t("title")} body={t("body")} back={t("back")} home={localePath(locale)} />;
}
