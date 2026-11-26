import { GLYPHS } from "@/lib/ascii/core";

/*
 * Campo de glifos estático do estado inicial da intro (data-intro="pending",
 * antes do 1º paint): o mesmo "pó" espalhado do 1º quadro da intro, no lugar
 * do esboço do retrato, até o canvas assumir. Gerado no servidor com uma
 * semente fixa (mesmo HTML sempre; ~4 KB gzip). Só aparece com a intro;
 * sem JS ou sem intro, o CSS nunca o mostra.
 */
const N = 220;

function build() {
  let seed = 0x2f6b9a1d;
  const rnd = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 100000) / 100000;
  };
  const set = GLYPHS.replace(/\s/g, "");
  const esc = (c: string) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c);
  let body = "";
  for (let i = 0; i < N; i++) {
    const x = (rnd() * 100).toFixed(1);
    const y = (rnd() * 100).toFixed(1);
    const g = esc(set[Math.floor(rnd() * set.length)]);
    const amber = rnd() < 0.08;
    const o = (0.18 + rnd() * 0.3).toFixed(2);
    body += `<text x="${x}%" y="${y}%"${amber ? ' fill="#f5a524"' : ""} fill-opacity="${o}">${g}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="9" fill="currentColor">${body}</svg>`;
  return svg;
}
const SVG = build(); // uma vez por processo (build/SSG)

export function IntroField() {
  return <div className="hero-intro-field" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SVG }} />;
}
