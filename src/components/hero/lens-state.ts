/*
 * Estado compartilhado da lente (mutável de propósito: muda a cada frame
 * e não deve re-renderizar o React). O LensController escreve; o canvas
 * WebGL lê. Coordenadas em px CSS relativas ao hero.
 */
export const lens = {
  x: 0,
  y: 0,
  r: 90,
  /* ponteiro normalizado (-1..1) relativo ao hero, para deformar o objeto */
  mx: 0,
  my: 0,
};
