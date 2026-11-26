import photo from "../../public/portrait.png";

/*
 * Retrato do Léo: FONTE ÚNICA. Hero (canvas ASCII, lente, fallback estático)
 * e ABOUT usam só esta constante.
 *   - `photo`: import estático → URL com hash (/_next/static/media/…), que
 *     quebra o cache quando a foto muda; width/height vêm do arquivo.
 *   - `file`: o mesmo arquivo no disco, lido no build (sharp) para gerar o
 *     ASCII estático, os níveis e a máscara de alpha.
 * PNG com fundo transparente: o alpha define a silhueta (fora dela, nada).
 */
export const portrait = {
  photo,
  file: "public/portrait.png",
} as const;
