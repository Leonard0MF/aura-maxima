import { ImageResponse } from "next/og";

import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";

import { profile } from "@/content/profile";
import { routing, type Locale } from "@/i18n/routing";
import { scanLines } from "@/lib/site";

const size = { width: 1200, height: 630 };
type Params = { locale: string } | Promise<{ locale: string }>;
const localeOf = async (params: Params): Promise<Locale> => {
  const { locale } = await params;
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
};

/* uma imagem por idioma (alt e textos traduzidos), gerada no build */
export async function generateImageMetadata({ params }: { params: Params }) {
  const t = await getTranslations({ locale: await localeOf(params), namespace: "meta" });
  return [{ id: "og", alt: `${profile.name} · ${t("role")}`, size, contentType: "image/png" }];
}

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeOf(params);
  const t = await getTranslations({ locale, namespace: "meta" });
  const lines = await scanLines(locale);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b0d10",
          color: "#e6e8eb",
          padding: 72,
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", fontSize: 26, color: "#a3acb6", gap: 8 }}>
          <div style={{ display: "flex" }}>
            <span style={{ color: "#f5a524" }}>$</span>&nbsp;recon --target &quot;{profile.name}&quot;
          </div>
          {lines.map((l) => (
            <div key={l.label} style={{ display: "flex" }}>
              <span style={{ color: "#f5a524" }}>[+]</span>&nbsp;{l.label}&nbsp;·&nbsp;<span style={{ color: "#e6e8eb" }}>{l.result}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>{profile.name}</div>
          <div style={{ fontSize: 36, color: "#f5a524", marginTop: 8 }}>{t("role")}</div>
        </div>
      </div>
    ),
    size,
  );
}
