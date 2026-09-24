import { Instrument_Sans, JetBrains_Mono, Syne } from "next/font/google";

/*
 * Display: Syne. Larga, geométrica e um pouco esquisita nas
 * formas, o que dá personalidade ao nome e ao título da Storm
 * sem parecer um template.
 */
export const display = Syne({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

/* Corpo: Instrument Sans, neutra e legível em texto pequeno. */
export const body = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/* Labels técnicos (eyebrow, rodapé): coerente com o lado security. */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});