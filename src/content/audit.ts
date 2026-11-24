/*
 * Auditoria de segurança deste site (seção "Auditoria deste site").
 *
 * Os dados vêm de `audit.json`, atualizado à mão a partir da saída do Aegis.
 * NUNCA infle a nota: o card mostra exatamente o que estiver no JSON, e
 * campos `null` aparecem como "pendente".
 *
 * Formato de audit.json:
 * {
 *   "target":      string                // domínio verificado, ex.: "leo.dev"
 *   "tool":        string                // "Aegis"
 *   "toolVersion": string | null         // versão/commit do Aegis usado
 *   "checkedAt":   string | null         // data ISO 8601 da verificação, ex.: "2026-12-01"
 *   "source":      string                // de onde vieram os dados (texto livre)
 *   "score":       number | null         // 0–100, como o Aegis reporta
 *   "grade":       string | null         // ex.: "A", "A+", "B"
 *   "headers": [                         // ordem = ordem de exibição
 *     {
 *       "id":     string                 // chave estável, ex.: "strict-transport-security"
 *       "label":  string                 // nome exibido
 *       "status": "pass" | "warn" | "fail" | "unknown"
 *       "detail": string                 // valor/observação curta
 *     }
 *   ],
 *   "tls": {
 *     "valid":     boolean | null
 *     "issuer":    string | null         // ex.: "Let's Encrypt R11"
 *     "protocol":  string | null         // ex.: "TLS 1.3"
 *     "expiresAt": string | null         // data ISO 8601
 *   }
 * }
 */
import data from "./audit.json";

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export type Audit = {
  target: string;
  tool: string;
  toolVersion: string | null;
  checkedAt: string | null;
  source: string;
  score: number | null;
  grade: string | null;
  headers: { id: string; label: string; status: CheckStatus; detail: string }[];
  tls: { valid: boolean | null; issuer: string | null; protocol: string | null; expiresAt: string | null };
};

export const audit = data as Audit;
