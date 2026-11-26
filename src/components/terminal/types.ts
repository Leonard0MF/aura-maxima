/* Textos do terminal (messages: terminal.*). {x} = valor trocado no cliente. */
export type TerminalStrings = {
  aria: string;
  close: string;
  shortcuts: string;
  shortcutsLabel: string;
  inputLabel: string;
  ready: string;
  cleared: string;
  newTab: string;
  whoami: string[];
  help: [string, string][];
  available: string;
  tip: string;
  noSuchFile: string;
  catUsage: string;
  noSuchFinding: string;
  caseStudy: string;
  repo: string;
  demo: string;
  cv: string;
  cvMissing: string;
  cvLink: string;
  empty: string;
  sudoPrompt: string;
  sudoOk: string;
  sudoNext: string;
  sudoDeny: string;
  notFound: string;
  listHint: string;
};

/* Dados serializáveis que o servidor passa ao terminal (mantém profile.ts fora do bundle). */
export type TerminalData = {
  name: string;
  strings: TerminalStrings;
  projects: {
    id: string;
    slug: string;
    title: string;
    kind: string;
    /** rótulo neutro já traduzido (PROJETO PESSOAL, SISTEMA INTERNO) */
    label: string;
    summary: string;
    stack: string[];
    href: string;
    repo?: string;
    demo?: string;
  }[];
  skills: { port: string; title: string; state: string; items: string[] }[];
  contact: { email: string; linkedin: string; github: string };
  cv: string | null;
  scan: { label: string; result: string }[];
};

export type Tone = "fg" | "muted" | "dim" | "accent" | "ok" | "err";

export type Seg = { t: string; tone?: Tone; href?: string; internal?: boolean; download?: boolean };
export type Line = Seg[];
