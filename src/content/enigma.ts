import photo from "../../public/enigma.webp";

/*
 * Foto de fundo do hero: uma máquina Enigma (Enigma-K do Exército suíço).
 * Fonte: Wikimedia Commons, "Enigma-IMG 0484-white.jpg", por Rama,
 * CC BY-SA 2.0 FR (atribuição obrigatória: CREDITS.md e rodapé do site).
 * Alterações: fundo branco removido (alfa), recorte, redução para 1100 px,
 * WebP sem metadados. O arquivo derivado segue sob CC BY-SA 2.0 FR.
 */
export const enigma = {
  photo,
  file: "public/enigma.webp",
  credit: {
    author: "Rama",
    license: "CC BY-SA 2.0 FR",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/fr/deed.en",
    source: "https://commons.wikimedia.org/wiki/File:Enigma-IMG_0484-white.jpg",
  },
} as const;
