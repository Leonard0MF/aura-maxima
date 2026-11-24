import { Archivo_Black, Geist, JetBrains_Mono } from "next/font/google";

/* Texto corrido. */
export const sans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

/* Terminal, labels e campos do relatório.
 * Variável (sem `weight`): um arquivo cobre 100–800. Pedir pesos fixos fazia
 * o Google devolver para o 700 uma URL `l/font?kit=…&skey=…`, que o Turbopack
 * em dev não resolve ("next/font/google queries have exactly one entry"). */
export const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
});

/* Display editorial do hero (um único peso). */
export const display = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-archivo",
});
