/*
 * Demo "Escaneie este site" (seção 03 · AUDIT): replay de um scan REAL do
 * Aegis sobre o domínio do portfólio.
 *
 * Os dados vêm de `audit.json`, gerado rodando o Aegis no domínio publicado.
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
 *   "categories": [               // ordem = ordem do replay (7 no Aegis)
 *     {
 *       "id":      "tls" | "headers" | "cookies" | "dns" | "vulns" | "reputation" | "surface"
 *       "label":   string         // nome exibido, ex.: "TLS"
 *       "status":  "pass" | "warn" | "fail" | "info"
 *       "summary": string         // resultado em uma linha, ex.: "TLS 1.3 · cadeia válida · expira em 62 dias"
 *     }
 *   ],
 *   "servers": [                  // onde o domínio resolve (mini-mapa)
 *     { "ip": string, "city": string, "country": string, "lat": number, "lon": number, "provider": string | null }
 *   ],
 *   "notes": string[]             // observações curtas exibidas abaixo do resultado (opcional)
 * }
 */
import data from "./audit.json";

export type CheckStatus = "pass" | "warn" | "fail" | "info";

export type AuditCategory = { id: string; label: string; status: CheckStatus; summary: string };
export type AuditServer = { ip: string; city: string; country: string; lat: number; lon: number; provider: string | null };

export type Audit = {
  example: boolean;
  target: string;
  tool: string;
  toolVersion: string | null;
  scannedAt: string | null;
  score: number | null;
  grade: string | null;
  categories: AuditCategory[];
  servers: AuditServer[];
  notes?: string[];
};

export const audit = data as Audit;

/* nota só existe para dados reais */
export const auditGrade = audit.example ? null : audit.grade;
export const auditScore = audit.example ? null : audit.score;
