/*
 * Simulação EDUCATIVA de SQL injection, 100% no navegador.
 *
 * Não é uma engine SQL: é um avaliador mínimo que entende só o que a query
 * de login vulnerável pode virar — comparações com `=`, AND / OR, literais
 * entre aspas simples, números, `1`, comentários `--` e `#`. Basta para
 * mostrar os padrões clássicos (tautologia, comentário, admin'--).
 */

export type Row = { id: number; user: string; pass: string; role: string };

/* usuários fictícios; "senhas" são hashes falsos (nunca batem com texto) */
export const USERS: Row[] = [
  { id: 1, user: "admin", pass: "$2b$10$Qe1x…9fK2", role: "admin" },
  { id: 2, user: "maria", pass: "$2b$10$7hVd…Lp0a", role: "editor" },
  { id: 3, user: "joao", pass: "$2b$10$mN4c…Zt8s", role: "user" },
  { id: 4, user: "ana", pass: "$2b$10$Yw2k…Hq5e", role: "user" },
  { id: 5, user: "dev", pass: "$2b$10$Bc9r…Xu1m", role: "dev" },
];

export type Seg = { text: string; kind: "kw" | "str" | "op" | "num" | "id" | "inj" | "comment" | "plain" };

const PRE = "SELECT * FROM users WHERE user = '";
const MID = "' AND pass = '";
const POST = "'";

type Tok =
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: "=" | "(" | ")" }
  | { t: "kw"; v: "AND" | "OR" | "NOT" | "TRUE" | "FALSE" };

/* Monta a query vulnerável e a pinta: cada caractere sabe se veio do
 * visitante e se ficou dentro ou fora de uma string. */
export function buildVulnerable(user: string, pass: string) {
  const parts: { s: string; input: boolean }[] = [
    { s: PRE, input: false },
    { s: user, input: true },
    { s: MID, input: false },
    { s: pass, input: true },
    { s: POST, input: false },
  ];
  const chars: { c: string; input: boolean }[] = [];
  for (const p of parts) for (const c of p.s) chars.push({ c, input: p.input });

  const segs: Seg[] = [];
  const push = (text: string, kind: Seg["kind"]) => {
    const last = segs.at(-1);
    if (last && last.kind === kind) last.text += text;
    else segs.push({ text, kind });
  };

  const toks: Tok[] = [];
  let i = 0;
  let error: string | null = null;
  let injected = false;
  const where = PRE.indexOf("WHERE") + 5;
  /* cabeçalho fixo: SELECT * FROM users WHERE */
  for (const w of PRE.slice(0, where).split(/(\s+)/)) push(w, /^(SELECT|FROM|WHERE)$/.test(w) ? "kw" : "plain");
  i = where;

  while (i < chars.length) {
    const { c, input } = chars[i];
    if (/\s/.test(c)) {
      push(c, "plain");
      i++;
      continue;
    }
    if (c === "'") {
      /* string: até a próxima aspa ('' é aspa escapada) */
      const quoteFromInput = input;
      let j = i + 1;
      let v = "";
      let closed = false;
      while (j < chars.length) {
        if (chars[j].c === "'") {
          if (chars[j + 1]?.c === "'") {
            v += "'";
            j += 2;
            continue;
          }
          closed = true;
          break;
        }
        v += chars[j].c;
        j++;
      }
      if (!closed) {
        error = "unterminated quoted string";
        for (let k = i; k < chars.length; k++) push(chars[k].c, chars[k].input ? "inj" : "str");
        break;
      }
      /* aspas de fora que abrem/fecham string: o texto dentro é dado; uma
       * aspa vinda do input que delimita a string é injeção */
      push("'", quoteFromInput ? "inj" : "str");
      for (let k = i + 1; k < j; k++) push(chars[k].c, "str");
      push("'", chars[j].input ? "inj" : "str");
      if (quoteFromInput || chars[j].input) injected = true;
      toks.push({ t: "str", v });
      i = j + 1;
      continue;
    }
    if (c === "-" && chars[i + 1]?.c === "-") {
      for (let k = i; k < chars.length; k++) push(chars[k].c, chars[k].input ? "inj" : "comment");
      if (input) injected = true;
      break;
    }
    if (c === "#") {
      for (let k = i; k < chars.length; k++) push(chars[k].c, chars[k].input ? "inj" : "comment");
      if (input) injected = true;
      break;
    }
    const rest = chars.slice(i).map((x) => x.c).join("");
    const m = rest.match(/^(\d+|[A-Za-z_][A-Za-z0-9_]*|=|\(|\)|;)/);
    if (!m) {
      error = `syntax error near "${c}"`;
      for (let k = i; k < chars.length; k++) push(chars[k].c, chars[k].input ? "inj" : "plain");
      break;
    }
    const w = m[1];
    const fromInput = chars.slice(i, i + w.length).some((x) => x.input);
    if (fromInput) injected = true;
    const up = w.toUpperCase();
    if (/^\d+$/.test(w)) toks.push({ t: "num", v: Number(w) });
    else if (["AND", "OR", "NOT", "TRUE", "FALSE"].includes(up)) toks.push({ t: "kw", v: up as "AND" });
    else if (w === "=" || w === "(" || w === ")") toks.push({ t: "op", v: w });
    else if (w === ";") {
      /* fim da instrução: o resto é ignorado nesta simulação */
    } else toks.push({ t: "id", v: w.toLowerCase() });
    push(w, fromInput ? "inj" : /^(AND|OR|NOT)$/i.test(w) ? "kw" : /^\d+$/.test(w) ? "num" : w === "=" ? "op" : "id");
    i += w.length;
  }

  const sql = chars.map((x) => x.c).join("");
  if (error) return { sql, segs, error, rows: [] as Row[], injected };
  try {
    const pred = parse(toks);
    return { sql, segs, error: null, rows: USERS.filter(pred), injected };
  } catch (e) {
    return { sql, segs, error: (e as Error).message, rows: [] as Row[], injected };
  }
}

/* Modo seguro: prepared statement. Os valores nunca viram SQL. */
export function runSafe(user: string, pass: string) {
  return USERS.filter((r) => r.user === user && r.pass === pass);
}

/* ---------- avaliador: OR < AND < NOT < comparação ---------- */
type Val = string | number | boolean;
function parse(toks: Tok[]): (r: Row) => boolean {
  let i = 0;
  const peek = () => toks[i];
  const atom = (): ((r: Row) => Val) => {
    const t = toks[i++];
    if (!t) throw new Error("syntax error at end of input");
    if (t.t === "str" || t.t === "num") return () => t.v;
    if (t.t === "kw" && (t.v === "TRUE" || t.v === "FALSE")) return () => t.v === "TRUE";
    if (t.t === "id") {
      if (t.v !== "user" && t.v !== "pass" && t.v !== "role" && t.v !== "id") throw new Error(`column "${t.v}" does not exist`);
      return (r) => r[t.v as keyof Row];
    }
    if (t.t === "op" && t.v === "(") {
      const e = or();
      if (toks[i++]?.t !== "op") throw new Error("syntax error: missing )");
      return e;
    }
    throw new Error(`syntax error near "${t.v}"`);
  };
  const cmp = (): ((r: Row) => Val) => {
    const a = atom();
    const t = peek();
    if (t && t.t === "op" && t.v === "=") {
      i++;
      const b = atom();
      return (r) => String(a(r)) === String(b(r));
    }
    return a;
  };
  const not = (): ((r: Row) => Val) => {
    const t = peek();
    if (t && t.t === "kw" && t.v === "NOT") {
      i++;
      const e = not();
      return (r) => !truthy(e(r));
    }
    return cmp();
  };
  const and = (): ((r: Row) => Val) => {
    let e = not();
    while (peek()?.t === "kw" && (peek() as { v: string }).v === "AND") {
      i++;
      const a = e, b = not();
      e = (r) => truthy(a(r)) && truthy(b(r));
    }
    return e;
  };
  const or = (): ((r: Row) => Val) => {
    let e = and();
    while (peek()?.t === "kw" && (peek() as { v: string }).v === "OR") {
      i++;
      const a = e, b = and();
      e = (r) => truthy(a(r)) || truthy(b(r));
    }
    return e;
  };
  const e = or();
  if (i < toks.length) throw new Error(`syntax error near "${String((toks[i] as { v: unknown }).v)}"`);
  return (r) => truthy(e(r));
}
/* como no MySQL: string não numérica vale 0 (falso); número ≠ 0 é verdadeiro */
const truthy = (v: Val) => (typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : Number(v) !== 0 && !Number.isNaN(Number(v)));
