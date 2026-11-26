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
 * Seção 02 · STACK.
 *
 * stackIndex: o índice em texto, por categoria. `level` só onde foi indicado:
 *   practice = Prática (uso em projetos reais), familiar = Familiaridade (já
 *   usei, sem profundidade), contact = Contato (explorando).
 * `name` ausente = nome traduzível em messages (stack.items.<id>).
 *
 * stackCoins: as moedas 3D (ids do índice + Vercel, que só existe como moeda).
 * A ordem é a do desenho; no celular entram só as de stackCoinsMobile.
 * A frase de cada moeda fica em messages (stack.tokens.<id>).
 */
export type StackLevel = "practice" | "familiar" | "contact";
export type StackItem = { id: string; name?: string; level?: StackLevel };
export type StackCategory = { id: string; items: StackItem[] };

export const stackIndex: StackCategory[] = [
  {
    id: "languages",
    items: [
      { id: "javascript", name: "JavaScript", level: "practice" },
      { id: "typescript", name: "TypeScript", level: "practice" },
      { id: "html5", name: "HTML5", level: "practice" },
      { id: "css3", name: "CSS3", level: "practice" },
      { id: "cpp", name: "C++", level: "contact" },
      { id: "java", name: "Java", level: "contact" },
    ],
  },
  {
    id: "frontend",
    items: [
      { id: "react", name: "React", level: "practice" },
      { id: "nextjs", name: "Next.js", level: "practice" },
      { id: "tailwind", name: "Tailwind CSS", level: "practice" },
      { id: "vite", name: "Vite", level: "familiar" },
      { id: "vue", name: "Vue.js", level: "contact" },
      { id: "reactnative", name: "React Native", level: "contact" },
      { id: "flutter", name: "Flutter", level: "contact" },
    ],
  },
  {
    id: "visual",
    items: [
      { id: "threejs", name: "Three.js" },
      { id: "r3f", name: "React Three Fiber" },
      { id: "webgl", name: "WebGL" },
      { id: "gsap", name: "GSAP" },
      { id: "framer", name: "Framer Motion" },
      { id: "lenis", name: "Lenis" },
      { id: "lucide", name: "Lucide React" },
      { id: "tsrouter", name: "TanStack Router" },
      { id: "tsstart", name: "TanStack Start" },
    ],
  },
  {
    id: "backend",
    items: [
      { id: "nodejs", name: "Node.js" },
      { id: "supabase", name: "Supabase" },
      { id: "postgresql", name: "PostgreSQL" },
      { id: "sql", name: "SQL" },
      { id: "rest" },
      { id: "auth" },
      { id: "rls", name: "Row Level Security (RLS)" },
    ],
  },
  {
    id: "secTools",
    items: [
      { id: "kali", name: "Kali Linux", level: "practice" },
      { id: "nmap", name: "Nmap", level: "practice" },
      { id: "docker", name: "Docker" },
      { id: "git", name: "Git" },
      { id: "github", name: "GitHub" },
    ],
  },
  {
    id: "secConcepts",
    items: [
      { id: "vulns" },
      { id: "codeaudit" },
      { id: "osint", name: "OSINT" },
      { id: "netenum", name: "Network Enumeration" },
      { id: "tcpip", name: "TCP/IP" },
      { id: "dns", name: "DNS" },
      { id: "http", name: "HTTP/HTTPS" },
      { id: "tls", name: "TLS" },
      { id: "websec", name: "Web Security" },
      { id: "hardening", name: "Security Hardening" },
      { id: "threat", name: "Threat Modeling" },
      { id: "securearch", name: "Secure Architecture" },
      { id: "netmon", name: "Network Monitoring" },
    ],
  },
  {
    id: "systems",
    items: [
      { id: "linux" },
      { id: "kali", name: "Kali Linux" },
      { id: "ubuntu", name: "Ubuntu" },
      { id: "windows", name: "Windows" },
    ],
  },
];

export const stackCoins: { id: string; name: string }[] = [
  { id: "react", name: "React" },
  { id: "nextjs", name: "Next.js" },
  { id: "typescript", name: "TypeScript" },
  { id: "javascript", name: "JavaScript" },
  { id: "html5", name: "HTML5" },
  { id: "css3", name: "CSS3" },
  { id: "tailwind", name: "Tailwind CSS" },
  { id: "nodejs", name: "Node.js" },
  { id: "supabase", name: "Supabase" },
  { id: "postgresql", name: "PostgreSQL" },
  { id: "threejs", name: "Three.js" },
  { id: "framer", name: "Framer Motion" },
  { id: "gsap", name: "GSAP" },
  { id: "vite", name: "Vite" },
  { id: "docker", name: "Docker" },
  { id: "git", name: "Git" },
  { id: "github", name: "GitHub" },
  { id: "linux", name: "Linux" },
  { id: "kali", name: "Kali Linux" },
  { id: "ubuntu", name: "Ubuntu" },
  { id: "vercel", name: "Vercel" },
  { id: "nmap", name: "Nmap" },
];

/* celular: ~10 moedas (as de uso diário e as de segurança) */
export const stackCoinsMobile = ["react", "nextjs", "typescript", "javascript", "nodejs", "tailwind", "supabase", "linux", "kali", "nmap"];

/* nível de cada id (primeira ocorrência no índice que tem nível) */
export function stackLevel(id: string): StackLevel | undefined {
  for (const c of stackIndex) for (const it of c.items) if (it.id === id && it.level) return it.level;
  return undefined;
}

/* total real de itens: ids únicos do índice + moedas que só existem como moeda */
export const stackCount = new Set([...stackIndex.flatMap((c) => c.items.map((i) => i.id)), ...stackCoins.map((c) => c.id)]).size;

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
