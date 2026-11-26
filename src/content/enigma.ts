import photo from "../../public/enigma.webp";

/*
 * Foto de fundo do hero: uma máquina Enigma I (modelo militar), em 3/4 de
 * cima: painel de lâmpadas, rotores, teclado e plugboard visíveis.
 * Fonte: Wikimedia Commons, "Enigma (crittografia) - Museo scienza e
 * tecnologia Milano.jpg", por Alessandro Nassiri / Museo Nazionale della
 * Scienza e della Tecnologia "Leonardo da Vinci", CC BY-SA 4.0 (atribuição
 * obrigatória: CREDITS.md e rodapé do site).
 * Alterações: fundo removido (alfa), recorte, WebP sem metadados. O arquivo
 * derivado segue sob CC BY-SA 4.0.
 */
export const enigma = {
  photo,
  file: "public/enigma.webp",
  credit: {
    author: "Alessandro Nassiri / Museo della Scienza e della Tecnologia",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    source: "https://commons.wikimedia.org/wiki/File:Enigma_(crittografia)_-_Museo_scienza_e_tecnologia_Milano.jpg",
  },
} as const;
