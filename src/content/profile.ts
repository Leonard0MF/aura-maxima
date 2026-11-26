/*
 * Dados do portfólio (o que NÃO é texto traduzível): ids, links, stacks,
 * tipos de projeto, caminhos. Todo texto exibido vive em messages/{pt,en,es}.json
 * e é buscado pela mesma chave (ex.: projects.aegis.summary).
 *
 * Tudo marcado com `TODO:` é informação que ainda falta: não invente,
 * preencha com o dado real.
 */
/* tipo do projeto: rótulo neutro no WORK (work.kinds.<kind> em messages).
 * Não é severidade: nada de CRITICAL/HIGH, que podem ser lidos como
 * vulnerabilidades encontradas nos sistemas. */
export type ProjectKind = "personal" | "internal";

export type Project = {
  id: string; // FND-001
  slug: "aegis" | "bumphub"; // chave em messages: projects.<slug> e cases.<slug>
  kind: ProjectKind;
  title: string;
  /** nome curto em caixa alta, usado gigante no bloco do WORK */
  display: string;
  year?: string;
  /** nomes de tecnologia; `{ key }` = item com texto traduzível em projects.<slug>.stack.<key> */
  stack: (string | { key: string })[];
  links: { demo?: string; repo?: string };
  /* Print do projeto em public/. Para trocar: substitua o arquivo (mesmo
     nome) e atualize width/height. A legenda (figcaption no WORK e alt no
     estudo de caso) vem de `caption` quando existe; sem ela, de messages
     (projects.<slug>.alt). */
  image?: { src: string; width: number; height: number; caption?: { pt: string; en: string; es: string } };
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
 * stackIndex: o índice em texto, por categoria. `level` em todas as
 * ferramentas; os conceitos de segurança não têm nível:
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
      { id: "python", name: "Python", level: "familiar" },
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
      { id: "threejs", name: "Three.js", level: "practice" },
      { id: "r3f", name: "React Three Fiber", level: "practice" },
      { id: "webgl", name: "WebGL", level: "familiar" },
      { id: "gsap", name: "GSAP", level: "familiar" },
      { id: "framer", name: "Framer Motion", level: "practice" },
      { id: "lenis", name: "Lenis", level: "familiar" },
      { id: "lucide", name: "Lucide React", level: "practice" },
      { id: "tsrouter", name: "TanStack Router", level: "practice" },
      { id: "tsstart", name: "TanStack Start", level: "practice" },
    ],
  },
  {
    id: "backend",
    items: [
      { id: "nodejs", name: "Node.js", level: "practice" },
      { id: "supabase", name: "Supabase", level: "practice" },
      { id: "postgresql", name: "PostgreSQL", level: "practice" },
      { id: "sql", name: "SQL", level: "familiar" },
      { id: "rest", level: "practice" },
      { id: "auth", level: "practice" },
      { id: "rls", name: "Row Level Security (RLS)", level: "practice" },
    ],
  },
  {
    id: "secTools",
    items: [
      { id: "kali", name: "Kali Linux", level: "practice" },
      { id: "nmap", name: "Nmap", level: "practice" },
      { id: "docker", name: "Docker", level: "familiar" },
      { id: "git", name: "Git", level: "practice" },
      { id: "github", name: "GitHub", level: "practice" },
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
      { id: "linux", level: "practice" },
      { id: "kali", name: "Kali Linux", level: "practice" },
      { id: "ubuntu", name: "Ubuntu", level: "practice" },
      { id: "windows", name: "Windows", level: "practice" },
    ],
  },
];

export const stackCoins: { id: string; name: string }[] = [
  { id: "react", name: "React" },
  { id: "nextjs", name: "Next.js" },
  { id: "typescript", name: "TypeScript" },
  { id: "javascript", name: "JavaScript" },
  { id: "python", name: "Python" },
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
    kind: "personal",
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
    kind: "internal",
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
    /* TODO: ao trocar o print, atualize width/height e a legenda abaixo */
    image: {
      src: "/bumphub.png",
      width: 1922,
      height: 976,
      caption: {
        pt: "Tela de login do BUMPHUB (entrar com GitHub)",
        en: "BUMPHUB login screen (sign in with GitHub)",
        es: "Pantalla de inicio de sesión de BUMPHUB (entrar con GitHub)",
      },
    },
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
