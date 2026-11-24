import { ImageResponse } from "next/og";

import { profile, scanLines } from "@/content/profile";
import { t } from "@/lib/i18n";

export const alt = `${profile.name} · ${t(profile.role)}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          {scanLines.map((l) => (
            <div key={l.label} style={{ display: "flex" }}>
              <span style={{ color: "#f5a524" }}>[+]</span>&nbsp;{l.label}&nbsp;·&nbsp;<span style={{ color: "#e6e8eb" }}>{l.result}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>{profile.name}</div>
          <div style={{ fontSize: 36, color: "#f5a524", marginTop: 8 }}>{t(profile.role)}</div>
        </div>
      </div>
    ),
    size,
  );
}
