/*
 * 03 · AUDIT: a constelação mostra a postura de segurança REAL deste site,
 * vinda de um scan do Aegis sobre o domínio publicado.
 *
 * Os dados vêm de `audit.json` (gerado rodando o Aegis no domínio publicado).
 * NUNCA invente nem infle a nota: a seção mostra exatamente o JSON. Enquanto
 * `example` for true, os dados são de EXEMPLO: a seção avisa isso e NÃO
 * mostra nota (score/grade são ignorados).
 *
 * Formato de audit.json
 * ---------------------
 * {
 *   "example":     boolean        // true = dados de exemplo (sem nota na tela)
 *   "target":      string         // domínio escaneado, ex.: "leo.dev"
 *   "tool":        "Aegis"
 *   "toolVersion": string | null  // versão/commit do Aegis
 *   "scannedAt":   string | null  // data ISO 8601 do scan, ex.: "2026-12-01T14:03:00Z"
 *   "score":       number | null  // 0–100, como o Aegis reporta
 *   "grade":       string | null  // "A" | "B" | "C" | "D" | "F"
 *   "nodes": [                    // 8–10 "nós principais" da constelação, na ordem do cartão
 *     {
 *       "id":     string          // único, ex.: "tls", "hsts", "csp", "hosting", "dns"
 *       "label":  string          // nome exibido, ex.: "Certificado TLS"
 *       "value":  string          // o dado em uma linha, ex.: "Let's Encrypt R11 · TLS 1.3 · até 2027-02-01"
 *       "status": "pass" | "warn" | "fail" | "info"
 *     }
 *   ]
 * }
 *
 * O nó da nota geral é gerado a partir de score/grade (não precisa estar em
 * `nodes`). Nós sugeridos: certificado TLS (emissor, versão, validade), cada
 * header de segurança, CDN/hospedagem e DNS (CAA, DNSSEC).
 */
import data from "./audit.json";

export type CheckStatus = "pass" | "warn" | "fail" | "info";
export type AuditNode = { id: string; label: string; value: string; status: CheckStatus };

export type Audit = {
  example: boolean;
  target: string;
  tool: string;
  toolVersion: string | null;
  scannedAt: string | null;
  score: number | null;
  grade: string | null;
  nodes: AuditNode[];
};

export const audit = data as Audit;

/* nota só existe para dados reais */
export const auditGrade = audit.example ? null : audit.grade;
export const auditScore = audit.example ? null : audit.score;

/* todos os nós da constelação: os do JSON + a nota geral */
export const auditNodes: AuditNode[] = [
  ...audit.nodes,
  {
    id: "grade",
    label: "Nota geral",
    value: auditGrade ? `${auditGrade} · ${auditScore ?? "—"}/100` : audit.example ? "— · dados de exemplo, sem nota" : "— · pendente",
    status: "info",
  },
];

export const auditDate = audit.scannedAt ? new Date(audit.scannedAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
