/*
 * Fonte única de conteúdo do portfólio.
 *
 * Os dois modos (terminal e clean) leem daqui. Onde o texto muda entre
 * os modos, o item tem `term` e `clean`; caso contrário, um texto só.
 *
 * Tudo marcado com `TODO:` é informação que ainda falta: não invente,
 * preencha com o dado real.
 */
import type { Localized } from "@/lib/i18n";

import { auditGrade } from "./audit";

export type Link = { label: Localized; href: string; external?: boolean };

export type Severity = "critical" | "high" | "medium";

export type Project = {
  id: string; // FND-001
  slug: string;
  severity: Severity;
  title: string;
  /** nome curto em caixa alta, usado gigante no bloco do WORK */
  display: string;
  year?: string;
  role?: Localized;
  summary: Localized;
  highlights?: Localized[]; // 3 destaques numerados no WORK
  stack: string[];
  links: { demo?: string; repo?: string };
  /* TODO: prints reais (BUMPHUB anonimizado). Coloque em public/projects/ e
     preencha, ex.: { src: "/projects/aegis.png", alt: { pt: "..." } }.
     De preferência tema claro: o ASCII desenha o escuro. Sem `image`, o bloco
     usa public/projects/placeholder.png (wireframe neutro). */
  image?: { src: string; width: number; height: number; alt: Localized };
  /** sistema interno: sem links externos, mostra a etiqueta "privado" */
  private?: boolean;
};

export type ServiceGroup = {
  id: string;
  port: string; // usado só no modo terminal
  title: { term: Localized; clean: Localized };
  items: string[];
  state: "open" | "filtered"; // "filtered" = explorando
};

export type Activity = {
  org: string;
  role: Localized;
  period: Localized;
  current?: boolean;
  bullets: Localized[];
};

/* TODO: domínio final do site (usado em metadata, sitemap e no selo). */
export const SITE_URL = "https://aura-maxima.vercel.app";

export const profile = {
  name: "Léo Machmann",
  fullName: "Leonardo Machmann Francisco",
  role: { pt: "Dev Full-Stack & Security" } satisfies Localized,
  tagline: {
    pt: "Construo aplicações web de ponta a ponta e testo como um atacante faria: pentest autorizado e revisão de código com foco em segurança.",
  } satisfies Localized,
  location: { pt: "Brasil" } satisfies Localized,
  status: { pt: "Disponível para oportunidades" } satisfies Localized,
  /* Saída do comando `whoami` no terminal do hero (3 linhas). */
  whoami: [
    { pt: "Léo Machmann · Dev Full-Stack & Security · Brasil" },
    { pt: "Construo aplicações web de ponta a ponta (React, Next.js, Node.js)." },
    { pt: "Faço pentest autorizado e code review com foco em segurança na BUMP." },
  ] satisfies Localized[],
  lastScan: "2026-11", // atualize quando mexer no conteúdo

  contact: {
    email: "TODO@exemplo.com", // TODO: e-mail público de contato
    github: "https://github.com/Leonard0MF",
    githubHandle: "Leonard0MF",
    linkedin: "https://www.linkedin.com/in/TODO", // TODO: URL do LinkedIn
    cv: "/cv/leo-machmann.pdf", // TODO: adicionar o PDF em public/cv/
  },

  aegisUrl: "https://aegis-ten-zeta.vercel.app/",
} as const;

export const services: ServiceGroup[] = [
  {
    id: "frontend",
    port: "443/tcp",
    state: "open",
    title: { term: { pt: "frontend" }, clean: { pt: "Frontend" } },
    items: [
      "HTML5",
      "CSS3",
      "JavaScript",
      "TypeScript",
      "React",
      "Next.js",
      "Tailwind CSS",
      "Framer Motion",
      "Vite",
      "TanStack Router/Start",
    ],
  },
  {
    id: "backend",
    port: "8080/tcp",
    state: "open",
    title: { term: { pt: "backend-data" }, clean: { pt: "Backend & Dados" } },
    items: [
      "Node.js",
      "APIs REST",
      "Integração com APIs externas",
      "Autenticação e sessões",
      "Supabase",
      "SQL",
      "Python",
    ],
  },
  {
    id: "infra",
    port: "22/tcp",
    state: "open",
    title: { term: { pt: "infra-tools" }, clean: { pt: "Infra & Ferramentas" } },
    items: ["Git/GitHub", "Docker", "Linux (uso diário)", "SSH", "Vercel", "Redes TCP/IP"],
  },
  {
    id: "security",
    port: "8443/tcp",
    state: "open",
    title: { term: { pt: "security" }, clean: { pt: "Segurança" } },
    items: [
      "Pentest autorizado",
      "OSINT",
      "Análise de vulnerabilidades",
      "Segurança de aplicações web",
      "Revisão de código com foco em segurança",
      "Análise de controle de acesso",
      "Análise de tráfego",
    ],
  },
  {
    id: "exploring",
    port: "9000/tcp",
    state: "filtered",
    title: { term: { pt: "exploring" }, clean: { pt: "Explorando" } },
    items: ["Vue.js", "React Native", "Flutter", "Java", "C++"],
  },
];

/*
 * Seção 02 · STACK (peças 3D). A ordem é a prioridade: no celular entram só
 * as 10 primeiras. `match` são os nomes usados em `projects[].stack` (para
 * mostrar quais projetos usam cada tecnologia).
 */
/* `use`: frase curta de como uso. Escritas a partir do que já está neste
 * arquivo (whoami, services, activity). TODO: revisar com as suas palavras. */
export const stackTokens: { id: string; name: string; use: string; match?: string[] }[] = [
  { id: "react", name: "React", use: "Construo as interfaces das aplicações web que desenvolvo de ponta a ponta.", match: ["React", "Next.js"] },
  { id: "nextjs", name: "Next.js", use: "Framework das minhas aplicações web, incluindo o Aegis e este portfólio." },
  { id: "typescript", name: "TypeScript", use: "Linguagem padrão no frontend e no backend dos meus projetos." },
  { id: "nodejs", name: "Node.js", use: "Backend: APIs REST, autenticação, sessões e integração com APIs externas." },
  { id: "tailwind", name: "Tailwind CSS", use: "Estilização do frontend, inclusive deste site.", match: ["Tailwind", "Tailwind CSS"] },
  { id: "python", name: "Python", use: "Scripts e automação no backend." },
  { id: "docker", name: "Docker", use: "Ambientes isolados e reproduzíveis para rodar e testar serviços." },
  { id: "postgresql", name: "PostgreSQL", use: "Bancos relacionais e SQL, direto ou via Supabase.", match: ["PostgreSQL", "Postgres", "SQL"] },
  { id: "linux", name: "Linux", use: "Meu sistema de uso diário, com SSH e redes TCP/IP." },
  { id: "kali", name: "Kali Linux", use: "Base dos pentests autorizados que faço, como o pentest interno semanal na BUMP." },
  { id: "javascript", name: "JavaScript", use: "A base de todo o frontend que escrevo." },
  { id: "supabase", name: "Supabase", use: "Banco de dados e autenticação no backend." },
  { id: "git", name: "Git", use: "Versionamento, code review dos commits do time e correções via Pull Request." },
  { id: "vite", name: "Vite", use: "Build e servidor de desenvolvimento em projetos React." },
  { id: "html5", name: "HTML5", use: "Marcação semântica e acessível, a base de qualquer interface.", match: ["HTML", "HTML5"] },
  { id: "css3", name: "CSS3", use: "Layout e animações, do grid editorial às transições deste site.", match: ["CSS", "CSS3"] },
  { id: "vercel", name: "Vercel", use: "Deploy dos meus projetos web, como o Aegis." },
];

export const projects: Project[] = [
  {
    id: "FND-001",
    slug: "aegis",
    severity: "critical",
    title: "Aegis",
    display: "AEGIS",
    year: "2026",
    role: { pt: "Projeto solo · produto, front, back e segurança" },
    summary: {
      pt: "Scanner da postura de segurança de um domínio. Analisa TLS, headers HTTP, cookies, DNS e e-mail, vulnerabilidades conhecidas das tecnologias detectadas, reputação e superfície de ataque, e dá uma nota de 0 a 100 com o que corrigir.",
    },
    highlights: [
      { pt: "Cruza as tecnologias detectadas com OSV, NVD e o catálogo CISA KEV de vulnerabilidades exploradas ativamente." },
      { pt: "Passivo por padrão. Testes ativos só depois de o dono provar a posse do domínio (registro TXT ou arquivo), com token HMAC e sem banco de dados." },
      { pt: "O próprio scanner é blindado: proteção contra SSRF com revalidação do IP a cada conexão (anti DNS rebinding), detecção sem ReDoS e rate limit na API." },
    ],
    stack: ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS 4", "Canvas 2D", "SVG", "Vercel (gru1)", "Vercel Firewall"],
    links: {
      repo: "https://github.com/Leonard0MF/aegis",
      demo: "https://aegis-ten-zeta.vercel.app/",
    },
    image: { src: "/aegis.png", width: 1896, height: 914, alt: { pt: "Painel do Aegis: nota de segurança, certificado TLS e verificações de um domínio" } },
  },
  {
    id: "FND-002",
    slug: "bumphub",
    severity: "high",
    title: "BUMPHUB",
    display: "BUMPHUB",
    year: undefined, // TODO: ano
    role: undefined, // TODO: papel
    summary: {
      pt: "Plataforma interna da BUMP que junta comunicação e gestão: canais de conversa no estilo Discord/Slack, tasks e integração com o GitHub para o time acompanhar o trabalho num lugar só.",
    },
    highlights: [
      { pt: "Canais e conversas do time em tempo real." },
      { pt: "Tasks ligadas ao trabalho no GitHub." },
      { pt: "Em desenvolvimento: acesso remoto aos computadores da empresa (Windows e Linux), inclusive pelo celular." },
    ],
    stack: ["TODO: stack"],
    links: {},
    private: true,
    image: { src: "/bumphub.png", width: 1922, height: 976, alt: { pt: "Tela de login do BUMPHUB (entrar com GitHub)" } },
  },
];

export const activity: Activity[] = [
  {
    org: "Bump Amortecedores",
    role: { pt: "TI e Desenvolvimento" },
    period: { pt: "out/2026 → atual" },
    current: true,
    bullets: [
      { pt: "Pentest interno semanal" },
      { pt: "QA e identificação de regressões" },
      { pt: "Code review dos commits do time" },
      { pt: "Correções via Pull Request" },
      { pt: "Suporte de TI a 3 setores" },
    ],
  },
  {
    org: "Elyra Studio",
    role: { pt: "Fundador" },
    period: { pt: "TODO: período" },
    bullets: [{ pt: "TODO: descrição da Elyra Studio (startup própria, encerrada)." }],
  },
];

/*
 * 04 · ABOUT. Texto em primeira pessoa. Os `facts` com "TODO:" não aparecem
 * no site até serem preenchidos.
 */
export const about = {
  /** public/portrait.png: foto do Léo (P&B é aplicado no CSS). Enquanto o
   * arquivo não existir, a seção mostra uma moldura marcada como pendente. */
  photo: "/portrait.png",
  opening: { pt: "Construo aplicações web de ponta a ponta e depois tento quebrá-las antes que alguém de fora tente." },
  body: {
    pt: "Sou o Léo, desenvolvedor full-stack com foco em segurança. Hoje cuido de TI e desenvolvimento na Bump Amortecedores: faço pentest interno toda semana, QA, revisão de código e correções via Pull Request, e criei e mantenho sozinho o BumpHub, o workspace interno da equipe de TI. Antes disso, fundei a Elyra Studio, minha própria startup. Uso Linux no dia a dia, gosto de entender como as coisas funcionam por baixo e acredito que segurança se resolve no código, não depois do deploy.",
  },
  principles: [
    { pt: "Segurança desde o primeiro commit" },
    { pt: "Code review e PRs pequenos" },
    { pt: "Entender o problema antes de escolher a ferramenta" },
  ],
  facts: [
    { label: { pt: "Cidade" }, value: { pt: "TODO: cidade" } },
    { label: { pt: "Formação" }, value: { pt: "TODO: formação / cursos" } },
    { label: { pt: "Idiomas" }, value: { pt: "TODO: idiomas" } },
    { label: { pt: "Fora do código" }, value: { pt: "TODO: algo fora do código" } },
  ],
};

/* TODO: preencher com os números reais. */
export const metrics: { value: string; label: Localized }[] = [
  { value: "TODO", label: { pt: "pentests internos realizados" } },
  { value: "TODO", label: { pt: "vulnerabilidades encontradas e corrigidas" } },
  { value: "TODO", label: { pt: "PRs de correção" } },
  { value: "3", label: { pt: "setores atendidos com suporte de TI" } },
];

export const scanLines: { label: string; result: string }[] = [
  { label: "resolving target", result: "ok" },
  { label: "enumerating stack", result: `${services.filter((s) => s.state === "open").reduce((n, s) => n + s.items.length, 0)} services` },
  { label: "scanning projects", result: `${projects.length} findings` },
  /* Vem da auditoria real; sem nota, mostra "pending" em vez de inventar. */
  { label: "checking security posture", result: auditGrade ?? "pending" },
];
