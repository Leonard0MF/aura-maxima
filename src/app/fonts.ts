import { Geist, JetBrains_Mono } from "next/font/google";

/* Texto corrido. */
export const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

/* Terminal, labels e campos do relatório. */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-jetbrains",
});
