/* Dados serializáveis que o servidor passa ao terminal (mantém profile.ts fora do bundle). */
export type TerminalData = {
  name: string;
  whoami: string[];
  projects: {
    id: string;
    slug: string;
    title: string;
    severity: string;
    summary: string;
    stack: string[];
    repo?: string;
    demo?: string;
  }[];
  skills: { port: string; title: string; state: string; items: string[] }[];
  contact: { email: string; linkedin: string; github: string };
  cv: string;
  scan: { label: string; result: string }[];
};

export type Tone = "fg" | "muted" | "dim" | "accent" | "ok" | "err";

export type Seg = { t: string; tone?: Tone; href?: string; internal?: boolean; download?: boolean };
export type Line = Seg[];
