/*
 * Importa o resultado REAL do Aegis para a seção AUDIT.
 *
 *   npm run audit:import -- caminho/aegis-historico-AAAA-MM-DD.json [--domain dominio]
 *
 * Lê o JSON exportado pelo Aegis (Configurações → Exportar JSON), pega o scan
 * mais recente do domínio do portfólio (SITE_URL em src/content/profile.ts,
 * ou --domain) e grava src/content/audit.json com `example: false`.
 *
 * Nada é inventado nem arredondado: nota, faixa e cada nó saem do próprio
 * scan. O que o scan não tiver fica de fora (ou "—"). Os `value` são técnicos
 * e neutros (valor do header, ✓ / ! / ✗, token como unsafe-inline): o site é
 * pt/en/es e as frases do Aegis são em português.
 *
 * Roda direto no Node ≥ 22.18 (type stripping), sem dependências.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Status = "pass" | "warn" | "fail" | "info";
type Check = { id: string; category: string; label: string; status: Status; detail: string };
type Scan = {
  domain: string;
  scannedAt: string;
  score: number;
  grade: string;
  tls: { issuer: string; protocol: string; validTo: string; valid: boolean } | null;
  dns: { platform?: string | null };
  email?: { dnssec: boolean | null };
  tech?: { name: string; category: string }[];
  checks: Check[];
};
type Node = { id: string; label: string; value: string; status: Status };

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "src/content/audit.json");

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/* ---------- argumentos ---------- */
const args = process.argv.slice(2);
const di = args.indexOf("--domain");
const domainArg = di >= 0 ? args.splice(di, 2)[1] : undefined;
const file = args[0];
if (!file) fail("informe o arquivo exportado: npm run audit:import -- caminho/aegis-historico.json");

const norm = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");

function siteDomain(): string {
  const src = readFileSync(resolve(ROOT, "src/content/profile.ts"), "utf8");
  const m = /SITE_URL\s*=\s*["'`]([^"'`]+)["'`]/.exec(src);
  if (!m) fail("SITE_URL não encontrado em src/content/profile.ts; use --domain");
  return norm(m[1]);
}
const domain = domainArg ? norm(domainArg) : siteDomain();

/* ---------- leitura e validação ---------- */
let raw: unknown;
try {
  raw = JSON.parse(readFileSync(resolve(file), "utf8"));
} catch (e) {
  fail(`não consegui ler ${file}: ${(e as Error).message}`);
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
if (!isObj(raw) || raw.app !== "aegis" || !Array.isArray(raw.scans)) {
  fail("o arquivo não é um export do Aegis (esperado { app: \"aegis\", scans: [...] })");
}
const isScan = (v: unknown): v is Scan =>
  isObj(v) &&
  typeof v.domain === "string" &&
  typeof v.score === "number" &&
  typeof v.grade === "string" &&
  typeof v.scannedAt === "string" &&
  Number.isFinite(Date.parse(v.scannedAt)) &&
  isObj(v.dns) &&
  Array.isArray(v.checks);

const scans = (raw.scans as unknown[]).filter(isScan).filter((s) => norm(s.domain) === domain);
if (!scans.length) {
  const seen = [...new Set((raw.scans as unknown[]).filter(isScan).map((s) => s.domain))];
  fail(`nenhum scan de ${domain} no arquivo. Domínios encontrados: ${seen.join(", ") || "nenhum"}`);
}
const scan = scans.sort((a, b) => Date.parse(b.scannedAt) - Date.parse(a.scannedAt))[0];

/* ---------- nós ---------- */
const byId = new Map(scan.checks.map((c) => [c.id, c]));
const rank: Record<Status, number> = { info: 0, pass: 1, warn: 2, fail: 3 };
/** pior status entre os checks que pontuam; só "info" se nenhum pontuar */
const worst = (cs: (Check | undefined)[]): Status =>
  cs.reduce<Status>((w, c) => (c && rank[c.status] > rank[w] ? c.status : w), "info");
const mark: Record<Status, string> = { pass: "✓", warn: "!", fail: "✗", info: "–" };
/** valor técnico do header; frase do Aegis vira símbolo (+ token entre parênteses, se houver) */
function headerValue(c: Check): string {
  const m = /^(?:Valor|X-Frame-Options):\s*(.+)$/i.exec(c.detail);
  if (m) return m[1];
  if (/^max-age=/i.test(c.detail)) return c.detail;
  if (/frame-ancestors/i.test(c.detail)) return "CSP frame-ancestors";
  const token = /\(([^)]+)\)\s*$/.exec(c.detail)?.[1] ?? /(unsafe-inline|unsafe-eval)/i.exec(c.detail)?.[1];
  return token ? `${mark[c.status]} ${token}` : mark[c.status === "info" ? "fail" : c.status];
}

const nodes: Node[] = [];

// TLS: emissor · protocolo · validade
{
  const tlsChecks = scan.checks.filter((c) => c.category === "tls");
  const t = scan.tls;
  const value = t
    ? [t.issuer, t.protocol, t.validTo ? `notAfter ${new Date(t.validTo).toISOString().slice(0, 10)}` : ""].filter(Boolean).join(" · ")
    : (byId.get("tls-cert")?.detail ?? "HTTPS indisponível");
  nodes.push({ id: "tls", label: "Certificado TLS", value, status: worst(tlsChecks) });
}

// headers de segurança (um nó por header, valor como o Aegis reportou)
const headers: [string, string, string][] = [
  ["hsts", "hsts", "Strict-Transport-Security"],
  ["csp", "csp", "Content-Security-Policy"],
  ["xfo", "x-frame", "X-Frame-Options"],
  ["nosniff", "xcto", "X-Content-Type-Options"],
  ["referrer", "referrer", "Referrer-Policy"],
  ["permissions", "permissions", "Permissions-Policy"],
];
for (const [id, checkId, label] of headers) {
  const c = byId.get(checkId);
  if (!c) continue;
  let value = headerValue(c);
  if (id === "hsts" && /includeSubDomains ativo/i.test(byId.get("hsts-subdomains")?.detail ?? "")) value += " · includeSubDomains";
  nodes.push({ id, label, value, status: c.status });
}

// cookies
{
  const none = byId.get("cookies");
  const flags = (["cookie-secure", "cookie-httponly", "cookie-samesite"] as const).map((id) => byId.get(id));
  if (flags.some(Boolean)) {
    const names = ["Secure", "HttpOnly", "SameSite"];
    const value = flags.map((c, i) => (c ? `${names[i]} ${mark[c.status]}` : "")).filter(Boolean).join(" · ");
    nodes.push({ id: "cookies", label: "Cookies", value, status: worst(flags) });
  } else if (none) {
    nodes.push({ id: "cookies", label: "Cookies", value: "0 cookies", status: "info" });
  }
}

// DNS / e-mail: CAA · DNSSEC · SPF · DMARC
{
  const caa = byId.get("caa"), spf = byId.get("spf"), dmarc = byId.get("dmarc");
  const dnssec = scan.email?.dnssec;
  const parts = [
    caa && `CAA ${mark[caa.status]}`,
    dnssec != null && `DNSSEC ${dnssec ? "✓" : "✗"}`,
    spf && `SPF ${mark[spf.status]}`,
    dmarc && `DMARC ${mark[dmarc.status]}`,
  ].filter(Boolean);
  if (parts.length) {
    const platform = scan.dns.platform ? ` · DNS: ${scan.dns.platform}` : "";
    nodes.push({ id: "dns", label: "DNS / e-mail", value: parts.join(" · ") + platform, status: worst([caa, spf, dmarc]) });
  }
}

// CDN / hospedagem
{
  const names = [...new Set((scan.tech ?? []).filter((t) => t.category === "cdn" || t.category === "hosting").map((t) => t.name))];
  const value = names.length ? names.join(" · ") : scan.dns.platform ? scan.dns.platform : "—";
  nodes.push({ id: "hosting", label: "CDN / hospedagem", value, status: "info" });
}

/* ---------- faixa (mesmos cortes do Aegis) ---------- */
const band = scan.score >= 80 ? "ok" : scan.score >= 50 ? "warn" : "bad";

const audit = {
  example: false,
  target: scan.domain,
  tool: "Aegis",
  toolVersion: null,
  scannedAt: new Date(scan.scannedAt).toISOString(),
  score: scan.score,
  grade: scan.grade,
  band,
  nodes,
};
writeFileSync(OUT, JSON.stringify(audit, null, 2) + "\n");

const days = Math.floor((Date.now() - Date.parse(scan.scannedAt)) / 86_400_000);
console.log(`✓ ${scan.domain}: nota ${scan.grade} · ${scan.score}/100 (${band}) · scan de ${audit.scannedAt.slice(0, 10)} (${days} dia(s) atrás)`);
for (const n of nodes) console.log(`  ${mark[n.status]} ${n.label}: ${n.value}`);
console.log(`→ ${OUT.replace(ROOT + "/", "")} atualizado. Confira com npm run build e faça o commit.`);
if (days > 30) console.warn("! o scan tem mais de 30 dias: considere escanear de novo antes de publicar.");
