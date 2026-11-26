/*
 * Confere se messages/en.json e messages/es.json têm exatamente a mesma
 * estrutura de messages/pt.json (a referência): mesmas chaves, mesmos tipos,
 * arrays do mesmo tamanho e os mesmos placeholders {x} em cada texto.
 * Sai com código 1 se algo divergir (roda antes do build: `prebuild`).
 */
import { readFileSync } from "node:fs";

const base = "pt";
const others = ["en", "es"];
const load = (l) => JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf8"));
const kind = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const ref = load(base);
const errors = [];

function walk(a, b, path, locale) {
  const ka = kind(a), kb = kind(b);
  if (kb === "undefined") return errors.push(`${locale}: falta ${path}`);
  if (ka !== kb) return errors.push(`${locale}: ${path} é ${kb}, esperado ${ka}`);
  if (ka === "array") {
    if (a.length !== b.length) errors.push(`${locale}: ${path} tem ${b.length} itens, esperado ${a.length}`);
    a.forEach((v, i) => i < b.length && walk(v, b[i], `${path}[${i}]`, locale));
  } else if (ka === "object") {
    for (const k of Object.keys(a)) walk(a[k], b[k], path ? `${path}.${k}` : k, locale);
    for (const k of Object.keys(b)) if (!(k in a)) errors.push(`${locale}: chave a mais ${path ? `${path}.${k}` : k}`);
  } else if (ka === "string") {
    /* vazio só vale onde o pt também é vazio (ex.: marco sem frase de hover) */
    if (!b.trim() && a.trim()) errors.push(`${locale}: ${path} está vazio`);
    else if (params(a) !== params(b)) errors.push(`${locale}: ${path} usa {${params(b)}}, esperado {${params(a)}}`);
  }
}

for (const l of others) walk(ref, load(l), "", l);

if (errors.length) {
  console.error(`i18n: ${errors.length} problema(s) nas traduções\n  ` + errors.join("\n  "));
  process.exit(1);
}
console.log(`i18n: ${others.join(", ")} conferem com ${base}`);
