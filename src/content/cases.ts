/*
 * Estudos de caso (/projetos/[slug]). A estrutura (tipo de bloco, rotas,
 * faixas da nota, fontes) fica aqui; os textos ficam em messages, na chave
 * cases.<slug>.<key> (title, body, groups, caps, items, flow, caption).
 * A página só renderiza. Tudo com "TODO:" é informação que falta.
 */

export type Kind = "text" | "groups" | "score" | "bullets" | "arch";

export type BlockSpec = {
  kind: Kind;
  key: string;
  routes?: string[];
  bands?: { grade: string; min: number }[];
  sources?: string[];
  /** conector entre etapas do diagrama: "→" (fluxo, padrão) ou "↔" (se conectam, sem ordem) */
  link?: "→" | "↔";
};

export type FlowNode = { label: string; note: string };

/* textos de um bloco, como vêm de messages */
export type BlockText = {
  title: string;
  body?: string[];
  groups?: { label: string; items: string }[];
  caps?: string[];
  items?: string[];
  /** etapas do diagrama; uma etapa pode ser uma coluna de caixas em paralelo */
  flow?: (FlowNode | FlowNode[])[];
  caption?: string;
};

export const cases: Record<"aegis" | "bumphub", BlockSpec[]> = {
  aegis: [
    { kind: "text", key: "problem" },
    { kind: "groups", key: "checks" },
    {
      kind: "score",
      key: "score",
      bands: [
        { grade: "F", min: 0 },
        { grade: "D", min: 50 },
        { grade: "C", min: 65 },
        { grade: "B", min: 80 },
        { grade: "A", min: 90 },
      ],
    },
    { kind: "text", key: "ethics" },
    { kind: "bullets", key: "self" },
    {
      kind: "arch",
      key: "arch",
      routes: ["/api/scan", "/api/scan/surface", "/api/scan/active", "/api/verify", "/api/threats"],
      sources: ["OSV", "NVD", "CISA KEV", "crt.sh", "Cert Spotter", "HackerTarget", "Spamhaus", "SURBL"],
    },
    { kind: "bullets", key: "next" },
  ],
  bumphub: [
    { kind: "text", key: "problem" },
    { kind: "groups", key: "features" },
    { kind: "arch", key: "arch", link: "↔" },
    { kind: "bullets", key: "security" },
    { kind: "bullets", key: "result" },
  ],
};
