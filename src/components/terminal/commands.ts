import type { Line, Seg, TerminalData } from "./types";

export type Result = { out: Line[]; clear?: boolean; download?: string };

const s = (t: string, tone?: Seg["tone"]): Seg => ({ t, tone });
const pad = (str: string, n: number) => str.padEnd(n, " ");

const HELP: [string, string][] = [
  ["help", "lista os comandos"],
  ["whoami", "quem é o alvo"],
  ["ls projects", "lista os findings"],
  ["cat <projeto>", "detalha um finding (ex.: cat aegis)"],
  ["skills", "stack técnica"],
  ["contact", "canais de contato"],
  ["cv", "baixa o currículo (PDF)"],
  ["history", "comandos anteriores"],
  ["clear", "limpa a tela"],
];

export function completions(data: TerminalData): string[] {
  return [
    ...HELP.map(([c]) => c).filter((c) => !c.includes("<")),
    "projects",
    "sudo hire leo",
    ...data.projects.map((p) => `cat ${p.slug}`),
  ];
}

export function run(raw: string, data: TerminalData, history: string[]): Result {
  const input = raw.trim().replace(/\s+/g, " ");
  const [cmd, ...args] = input.split(" ");
  const arg = args.join(" ").toLowerCase();

  switch (cmd?.toLowerCase()) {
    case "":
      return { out: [] };

    case "help":
      return {
        out: [
          [s("comandos disponíveis:", "muted")],
          ...HELP.map(([c, d]) => [s("  " + pad(c, 16), "accent"), s(d, "muted")]),
          [s("dica: Tab autocompleta, ↑/↓ navegam no histórico.", "dim")],
        ],
      };

    case "whoami":
      return { out: data.whoami.map((l, i) => [s(l, i === 0 ? "fg" : "muted")]) };

    case "ls":
      if (arg === "projects" || arg === "projetos" || arg === "") return listProjects(data);
      return { out: [[s(`ls: ${arg}: no such file or directory`, "err")]] };

    case "projects":
    case "projetos":
      return listProjects(data);

    case "cat": {
      if (!arg) return { out: [[s("uso: cat <projeto>  (ex.: cat aegis)", "muted")]] };
      const p = data.projects.find((x) => x.slug === arg || x.title.toLowerCase() === arg || x.id.toLowerCase() === arg);
      if (!p) return { out: [[s(`cat: ${arg}: no such finding. try 'ls projects'`, "err")]] };
      const out: Line[] = [
        [s(`${p.id} `, "dim"), s(`[${p.severity.toUpperCase()}] `, p.severity === "critical" ? "accent" : "muted"), s(p.title, "fg")],
        [s(p.summary, "muted")],
        [s("stack: ", "dim"), s(p.stack.join(", "), "muted")],
        [s("→ ", "accent"), { t: "estudo de caso", tone: "accent", href: `/projetos/${p.slug}`, internal: true }],
      ];
      if (p.repo) out.push([s("→ ", "accent"), { t: "repositório", tone: "accent", href: p.repo }]);
      if (p.demo) out.push([s("→ ", "accent"), { t: "demo", tone: "accent", href: p.demo }]);
      return { out };
    }

    case "skills":
    case "stack":
      return {
        out: data.skills.map((g) => [
          s(pad(g.port, 9), "dim"),
          s(pad(g.title, 14), "fg"),
          s(pad(g.state, 9), g.state === "open" ? "ok" : "accent"),
          s(g.items.join(" · "), "muted"),
        ]),
      };

    case "contact":
      return {
        out: [
          [s(pad("email", 10), "dim"), { t: data.contact.email, tone: "accent", href: `mailto:${data.contact.email}` }],
          [s(pad("linkedin", 10), "dim"), { t: data.contact.linkedin.replace(/^https:\/\/(www\.)?/, ""), tone: "accent", href: data.contact.linkedin }],
          [s(pad("github", 10), "dim"), { t: data.contact.github.replace(/^https:\/\//, ""), tone: "accent", href: data.contact.github }],
        ],
      };

    case "cv":
      return {
        out: [[s("[+] baixando currículo… ", "muted"), { t: "link direto", tone: "accent", href: data.cv, download: true }]],
        download: data.cv,
      };

    case "history":
      return {
        out: history.length
          ? history.map((h, i) => [s(String(i + 1).padStart(4, " ") + "  ", "dim"), s(h, "muted")])
          : [[s("(vazio)", "dim")]],
      };

    case "clear":
      return { out: [], clear: true };

    case "sudo":
      if (arg === "hire leo")
        return {
          out: [
            [s("[sudo] senha para recrutador: ", "muted"), s("********", "dim")],
            [s("[✓] permissão concedida. Ótima decisão.", "ok")],
            [s("Próximo passo: ", "muted"), { t: `mailto:${data.contact.email}`, tone: "accent", href: `mailto:${data.contact.email}` }],
          ],
        };
      return { out: [[s(`${input}: este incidente será reportado. 😉 tente 'sudo hire leo'`, "err")]] };

    default:
      return { out: [[s(`${cmd}: command not found. try 'help'`, "err")]] };
  }
}

function listProjects(data: TerminalData): Result {
  return {
    out: [
      ...data.projects.map((p) => [
        s(p.id + "  ", "dim"),
        s(pad(p.severity.toUpperCase(), 10), p.severity === "critical" ? "accent" : "muted"),
        s(pad(p.slug, 18), "fg"),
        s(p.title, "muted"),
      ]),
      [s("use 'cat <slug>' para detalhes", "dim")],
    ],
  };
}

export function lineText(lines: Line[]): string {
  return lines.map((l) => l.map((seg) => seg.t).join("")).join("\n");
}
