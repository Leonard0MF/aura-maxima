import photo from "../../public/enigma.webp";

/*
 * Foto de fundo do hero: uma máquina Enigma vista de frente, de cima
 * (simétrica: tampa dos rotores, janelas dos rotores, painel de lâmpadas e
 * teclado visíveis).
 * Fonte: Wikimedia Commons, "Enigma-DEP 4509-IMG 7455-white.jpg", por Rama
 * (trabalho próprio), CC BY-SA 3.0 FR (atribuição obrigatória: CREDITS.md e
 * rodapé do site).
 * Alterações: fundo branco removido (alfa), recorte, redução para 844 px,
 * WebP sem metadados. O arquivo derivado segue sob CC BY-SA 3.0 FR.
 */
/* desligada no PR Q: na composição pedida (atrás do retrato, 1,3× os
 * ombros, base acima de DEVELOPER) o teclado e as lâmpadas ficam escondidos
 * pelo tronco e sobra um retângulo cinza atrás da cabeça. Foto, crédito,
 * caixa (CSS) e lente continuam prontos: `true` liga tudo de novo. */
export const SHOW_ENIGMA = false;

export const enigma = {
  photo,
  file: "public/enigma.webp",
  credit: {
    author: "Rama",
    license: "CC BY-SA 3.0 FR",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/fr/deed.en",
    source: "https://commons.wikimedia.org/wiki/File:Enigma-DEP_4509-IMG_7455-white.jpg",
  },
} as const;
