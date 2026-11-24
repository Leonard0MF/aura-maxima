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

export type Link = { label: Localized; href: string; external?: boolean };

export type Severity = "critical" | "high" | "medium";

export type CaseStudy = {
  problem: Localized;
  solution: Localized;
  architecture: Localized[];
  decisions: Localized[];
  result: Localized;
};

export type Project = {
  id: string; // FND-001
  slug: string;
  severity: Severity;
  title: string;
  summary: Localized;
  stack: string[];
  links: { demo?: string; repo?: string };
  image?: { src: string; alt: Localized }; // TODO: prints reais/anonimizados
  caseStudy: CaseStudy;
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
  lastScan: "2026-11", // atualize quando mexer no conteúdo

  contact: {
    email: "TODO@exemplo.com", // TODO: e-mail público de contato
    github: "https://github.com/Leonard0MF",
    githubHandle: "Leonard0MF",
    linkedin: "https://www.linkedin.com/in/TODO", // TODO: URL do LinkedIn
    cv: "/cv/leo-machmann.pdf", // TODO: adicionar o PDF em public/cv/
  },

  aegisUrl: "https://github.com/Leonard0MF/aegis", // TODO: URL do Aegis publicado na Vercel
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

export const projects: Project[] = [
  {
    id: "FND-001",
    slug: "aegis",
    severity: "critical",
    title: "Aegis",
    summary: {
      pt: "Scanner de segurança de URLs e domínios: identifica vulnerabilidades, verifica certificados, atribui uma nota e gera um relatório completo.",
    },
    stack: ["Next.js", "TypeScript", "Node.js", "Vercel"], // TODO: confirmar stack real
    links: {
      repo: "https://github.com/Leonard0MF/aegis",
      demo: undefined, // TODO: URL do deploy na Vercel
    },
    caseStudy: {
      problem: {
        pt: "TODO: descrever o problema (ex.: avaliar a postura de segurança de um site exige várias ferramentas separadas e conhecimento técnico).",
      },
      solution: {
        pt: "Um scanner que recebe uma URL ou domínio, executa verificações de segurança (headers, certificado TLS, vulnerabilidades conhecidas) e consolida tudo em uma nota e um relatório.",
      },
      architecture: [
        { pt: "TODO: fluxo de requisição (entrada → validação → verificações → relatório)." },
        { pt: "TODO: onde roda cada verificação (funções serverless, filas etc.)." },
      ],
      decisions: [
        { pt: "TODO: proteção contra SSRF ao escanear URLs de terceiros (bloqueio de IPs privados/metadata)." },
        { pt: "TODO: rate limiting e prevenção de abuso." },
        { pt: "TODO: critérios da nota de segurança." },
      ],
      result: { pt: "TODO: resultado (uso, métricas, aprendizados)." },
    },
  },
  {
    id: "FND-002",
    slug: "bumphub",
    severity: "high",
    title: "BUMPHUB",
    summary: {
      pt: "Sistema interno da BUMP no estilo Discord/Slack, com canais, tasks e integração com GitHub para o time acompanhar o trabalho em um só lugar.",
    },
    stack: ["TODO: stack"],
    links: {},
    caseStudy: {
      problem: { pt: "TODO: problema de comunicação/organização que o BUMPHUB resolve." },
      solution: { pt: "TODO: visão geral da solução (chat, tasks, integração GitHub)." },
      architecture: [{ pt: "TODO: arquitetura (tempo real, banco, autenticação)." }],
      decisions: [{ pt: "TODO: decisões de segurança (controle de acesso por setor, sessões, webhooks do GitHub)." }],
      result: { pt: "TODO: resultado no time (adoção, ganhos)." },
    },
  },
  {
    id: "FND-003",
    slug: "fotos-de-eventos",
    severity: "medium",
    title: "Plataforma de fotos de eventos",
    summary: {
      pt: "Venda de fotos de eventos com marca d'água, liberação da imagem original após o pagamento e busca por reconhecimento facial.",
    },
    stack: ["TODO: stack"],
    links: {},
    caseStudy: {
      problem: { pt: "TODO: problema (fotógrafos vendendo fotos de eventos, participantes encontrando as próprias fotos)." },
      solution: { pt: "Marca d'água nas prévias, liberação do original só após o pagamento confirmado e reconhecimento facial para o participante encontrar as próprias fotos." },
      architecture: [{ pt: "TODO: armazenamento, processamento das imagens, pagamentos." }],
      decisions: [
        { pt: "TODO: como os originais ficam protegidos até o pagamento (URLs assinadas, storage privado)." },
        { pt: "TODO: tratamento de dados biométricos (consentimento, LGPD)." },
      ],
      result: { pt: "TODO: resultado." },
    },
  },
];

export const activity: Activity[] = [
  {
    org: "BUMP",
    role: { pt: "Dev / TI" },
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
    role: { pt: "Fundador / Dev" },
    period: { pt: "TODO: período · encerrada" },
    bullets: [{ pt: "TODO: descrição da Elyra Studio (startup própria, encerrada)." }],
  },
];

export const scanLines: { label: string; result: string }[] = [
  { label: "resolving target", result: "ok" },
  { label: "enumerating stack", result: `${services.filter((s) => s.state === "open").reduce((n, s) => n + s.items.length, 0)} services` },
  { label: "scanning projects", result: `${projects.length} findings` },
  { label: "checking security posture", result: "A+" },
];
