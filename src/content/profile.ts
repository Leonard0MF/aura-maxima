/*
 * Dados do portfólio (o que NÃO é texto traduzível): ids, links, stacks,
 * severidades, caminhos. Todo texto exibido vive em messages/{pt,en,es}.json
 * e é buscado pela mesma chave (ex.: projects.aegis.summary).
 *
 * Tudo marcado com `TODO:` é informação que ainda falta: não invente,
 * preencha com o dado real.
 */
export type Severity = "critical" | "high" | "medium";

export type Project = {
  id: string; // FND-001
  slug: "aegis" | "bumphub"; // chave em messages: projects.<slug> e cases.<slug>
  severity: Severity;
  title: string;
  /** nome curto em caixa alta, usado gigante no bloco do WORK */
  display: string;
  year?: string;
  /** nomes de tecnologia; `{ key }` = item com texto traduzível em projects.<slug>.stack.<key> */
  stack: (string | { key: string })[];
  links: { demo?: string; repo?: string };
  /* TODO: prints reais (BUMPHUB anonimizado). Coloque em public/ e preencha
     src/width/height; o alt fica em messages (projects.<slug>.alt). */
  image?: { src: string; width: number; height: number };
  /** sistema interno: sem links externos, mostra a etiqueta "privado" */
  private?: boolean;
  /** tem projects.<slug>.usage em messages ("Em produção na equipe de TI...") */
  usage?: boolean;
};

export type ServiceGroup = {
  id: "frontend" | "backend" | "infra" | "security" | "exploring"; // messages: services.<id>
  port: string; // usado só no terminal
  state: "open" | "filtered"; // "filtered" = explorando
};

/* TODO: domínio final do site (usado em metadata, sitemap e no selo). */
export const SITE_URL = "https://aura-maxima.vercel.app";

export const profile = {
  name: "Léo Machmann",
  fullName: "Leonardo Machmann Francisco",
  lastScan: "2026-11", // atualize quando mexer no conteúdo

  contact: {
    email: "TODO@exemplo.com", // TODO: e-mail público de contato
    github: "https://github.com/Leonard0MF",
    githubHandle: "Leonard0MF",
    linkedin: "https://www.linkedin.com/in/TODO", // TODO: URL do LinkedIn
  },

  aegisUrl: "https://aegis-ten-zeta.vercel.app/",
} as const;

export const services: ServiceGroup[] = [
  { id: "frontend", port: "443/tcp", state: "open" },
  { id: "backend", port: "8080/tcp", state: "open" },
  { id: "infra", port: "22/tcp", state: "open" },
  { id: "security", port: "8443/tcp", state: "open" },
  { id: "exploring", port: "9000/tcp", state: "filtered" },
];

/*
 * Seção 02 · STACK (peças 3D). A ordem é a prioridade: no celular entram só
 * as 10 primeiras. A frase de cada peça fica em messages (stack.tokens.<id>).
 * TODO: revisar as frases com as suas palavras.
 */
export const stackTokens: { id: string; name: string }[] = [
  { id: "react", name: "React" },
  { id: "nextjs", name: "Next.js" },
  { id: "typescript", name: "TypeScript" },
  { id: "nodejs", name: "Node.js" },
  { id: "tailwind", name: "Tailwind CSS" },
  { id: "python", name: "Python" },
  { id: "docker", name: "Docker" },
  { id: "postgresql", name: "PostgreSQL" },
  { id: "linux", name: "Linux" },
  { id: "kali", name: "Kali Linux" },
  { id: "javascript", name: "JavaScript" },
  { id: "supabase", name: "Supabase" },
  { id: "git", name: "Git" },
  { id: "vite", name: "Vite" },
  { id: "html5", name: "HTML5" },
  { id: "css3", name: "CSS3" },
  { id: "vercel", name: "Vercel" },
];

export const projects: Project[] = [
  {
    id: "FND-001",
    slug: "aegis",
    severity: "critical",
    title: "Aegis",
    display: "AEGIS",
    year: "2026",
    stack: ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4", "Canvas 2D", "SVG", "Vercel (gru1)", "Vercel Firewall"],
    links: {
      repo: "https://github.com/Leonard0MF/aegis",
      demo: "https://aegis-ten-zeta.vercel.app/",
    },
    image: { src: "/aegis.png", width: 1896, height: 914 },
  },
  {
    id: "FND-002",
    slug: "bumphub",
    severity: "high",
    title: "BUMPHUB",
    display: "BUMPHUB",
    year: undefined, // TODO: ano
    usage: true,
    stack: [
      "Next.js 16",
      "TypeScript",
      { key: "supabase" },
      "Electron",
      { key: "vscode" },
      "GitHub API + webhooks",
      "Tailscale API",
      "Web Crypto",
      "Vercel",
    ],
    links: {},
    private: true,
    image: { src: "/bumphub.png", width: 1922, height: 976 },
  },
];

/* Trajetória (ABOUT): os marcos ficam em messages (about.journey), com
 * TODO no ano do primeiro código, no período e na descrição da Elyra Studio
 * (startup própria, encerrada) e nas frases desses dois marcos. */

/* 04 · ABOUT. A foto vem de src/content/portrait.ts (fonte única). */
export const about = { author: "Leonardo Machmann" };

/* TODO: números reais para uma futura seção de métricas (ainda não exibida):
 * pentests internos realizados, vulnerabilidades encontradas e corrigidas,
 * PRs de correção, 3 setores atendidos com suporte de TI. */
