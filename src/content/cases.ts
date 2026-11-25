/*
 * Estudos de caso (/projetos/[slug]). Cada um é uma lista de blocos tipados;
 * a página só renderiza. Tudo com "TODO:" é informação que falta: não invente,
 * preencha com o dado real.
 */

export type Block =
  | { kind: "text"; title: string; body: string[] }
  | { kind: "groups"; title: string; groups: { label: string; items: string }[] }
  | { kind: "score"; title: string; body: string[]; caps: string[]; bands: { grade: string; min: number }[] }
  | { kind: "bullets"; title: string; body?: string[]; items: string[] }
  | {
      kind: "arch";
      title: string;
      body: string[];
      routes?: string[];
      /** etapas do diagrama; uma etapa pode ser uma coluna de caixas em paralelo */
      flow: (FlowNode | FlowNode[])[];
      /** conector entre etapas: "→" (fluxo, padrão) ou "↔" (se conectam, sem ordem) */
      link?: "→" | "↔";
      caption?: string;
      sources?: string[];
    };

export type FlowNode = { label: string; note: string };

export const cases: Record<string, Block[]> = {
  aegis: [
    {
      kind: "text",
      title: "O problema",
      body: [
        "Avaliar a segurança de um domínio exige juntar dezenas de verificações e fontes diferentes: certificado, headers, DNS, e-mail, vulnerabilidades conhecidas, listas de bloqueio, subdomínios esquecidos.",
        "O Aegis faz isso num scan só e diz o que corrigir.",
      ],
    },
    {
      kind: "groups",
      title: "O que é verificado",
      groups: [
        { label: "TLS", items: "Validade e cadeia do certificado, versões aceitas (1.0 a 1.3), cifras fracas, tamanho da chave, algoritmo de assinatura, OCSP stapling." },
        {
          label: "Transporte e headers",
          items: "Redirect HTTP→HTTPS, HSTS, CSP, clickjacking, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, exposição de versão do servidor, security.txt.",
        },
        { label: "Cookies", items: "Secure, HttpOnly, SameSite." },
        { label: "DNS e e-mail", items: "SPF (com o limite de 10 consultas), DMARC (inclusive herdado), DKIM, MTA-STS, TLS-RPT, CAA, DNSSEC." },
        { label: "Vulnerabilidades", items: "Tecnologias detectadas cruzadas com OSV, NVD e CISA KEV." },
        { label: "Reputação", items: "Spamhaus, SURBL e, opcionalmente, Google Safe Browsing e URLhaus." },
        {
          label: "Superfície de ataque",
          items:
            "Subdomínios via Certificate Transparency (crt.sh, Cert Spotter) e HackerTarget, com detecção de subdomain takeover, IPs internos no DNS público e subdomínios sensíveis.",
        },
        { label: "Testes ativos (só com prova de posse)", items: "Arquivos sensíveis expostos (.env, .git, backups, painéis) e portas de serviços internos." },
      ],
    },
    {
      kind: "score",
      title: "Como a nota funciona",
      body: ["Média ponderada das verificações: pass vale o peso cheio, warn vale metade.", "Achados graves limitam a nota, por melhor que seja o resto:"],
      caps: ["Arquivo sensível exposto", "CVE explorada ativamente (CISA KEV)", "Subdomain takeover", "Domínio em lista de bloqueio"],
      bands: [
        { grade: "F", min: 0 },
        { grade: "D", min: 50 },
        { grade: "C", min: 65 },
        { grade: "B", min: 80 },
        { grade: "A", min: 90 },
      ],
    },
    {
      kind: "text",
      title: "Ético por design",
      body: [
        "Varrer portas ou procurar arquivos em sites de terceiros sem autorização é crime (Lei 12.737/2012). Por isso os testes ativos exigem prova de posse: um registro TXT em _aegis-verify.<domínio> ou um arquivo em /.well-known/aegis-verify.txt, com um token HMAC do domínio.",
        "Em CDN ou hospedagem compartilhada, a varredura de portas é pulada: aquele IP atende outros clientes.",
      ],
    },
    {
      kind: "bullets",
      title: "Segurança do próprio Aegis",
      items: [
        "SSRF: recusa IPs privados e revalida o IP na conexão e em cada redirect.",
        "Orçamento de tempo por scan (45 s) e limite de tamanho nas respostas externas.",
        "Detecção sem regex vulnerável a ReDoS.",
        "CSP com nonce e strict-dynamic.",
        "Rate limit de 30 req/min por IP no Vercel Firewall.",
      ],
    },
    {
      kind: "arch",
      title: "Arquitetura",
      body: [
        "Sem conta e sem banco: o histórico fica no localStorage do navegador, exportável em JSON.",
        "Nenhuma dependência além de lucide-react: o globo é Canvas 2D e os gráficos são SVG.",
      ],
      routes: ["/api/scan", "/api/scan/surface", "/api/scan/active", "/api/verify", "/api/threats"],
      flow: [
        { label: "Navegador", note: "UI, histórico em localStorage" },
        { label: "API", note: "rotas /api/* na Vercel (gru1), rate limit" },
        { label: "Scanner", note: "verificações com orçamento de 45 s, anti-SSRF" },
        { label: "Fontes externas", note: "DNS, TLS, OSV, NVD, KEV, CT, listas" },
      ],
      sources: ["OSV", "NVD", "CISA KEV", "crt.sh", "Cert Spotter", "HackerTarget", "Spamhaus", "SURBL"],
    },
    {
      kind: "bullets",
      title: "Limitações e próximos passos",
      items: [
        "Falsos positivos possíveis em CVEs de servidor, por backport de correções nas distros (a versão anunciada não muda).",
        "Próximo passo: testes automatizados.",
      ],
    },
  ],

  bumphub: [
    {
      kind: "text",
      title: "O problema",
      body: [
        "A TI precisava de um lugar só para conversar, distribuir tarefas, acompanhar o trabalho no GitHub e gerenciar as máquinas da empresa, sem depender de várias ferramentas soltas.",
      ],
    },
    {
      kind: "groups",
      title: "O que tem no sistema",
      groups: [
        { label: "Chat em tempo real", items: "Canais, DMs, Markdown e código, reações, menções, \"digitando...\", anexos, não lidas e notificações." },
        { label: "Tópicos", items: "Tópicos por canal, com status e link para a issue ou o PR." },
        { label: "Atribuições", items: "4 níveis de urgência, prazo e notificação, para uma pessoa ou para um cargo." },
        { label: "GitHub", items: "PRs, issues, merges, commits e eventos ao vivo." },
        { label: "Streak", items: "Dias úteis com entregas, com mapa de calor no estilo do GitHub." },
        { label: "Codando agora", items: "Status \"codando agora\" via extensão própria do VS Code." },
        { label: "Inventário de máquinas", items: "Setor, sala, responsável, hardware e rede, com online/offline e acesso remoto." },
        { label: "Equipe e cargos", items: "Equipe e cargos no estilo do Discord." },
        { label: "Status automático", items: "Disponível, ausente e não perturbe." },
        { label: "Diário do time", items: "Diário do time com mini agenda." },
        { label: "Busca", items: "Busca global com Ctrl+K." },
        { label: "Tema", items: "Preto e amarelo, com modo claro." },
      ],
    },
    {
      kind: "arch",
      title: "Três apps num monorepo",
      body: [
        "web (Next.js): a interface e a API.",
        "desktop (Electron para Linux): distribuído em .deb, com bandeja, notificações nativas e início automático.",
        "vscode-extension: publica o status \"codando agora\", autenticada por token individual.",
      ],
      link: "↔",
      flow: [
        [
          { label: "web", note: "Next.js: interface + API" },
          { label: "desktop", note: "Electron (Linux, .deb): bandeja, notificações nativas, início automático" },
          { label: "vscode-extension", note: "status \"codando agora\", token individual" },
        ],
        { label: "Supabase", note: "Postgres, RLS, Realtime, Auth com GitHub" },
        [
          { label: "GitHub", note: "API + webhooks" },
          { label: "Tailscale", note: "API, somente leitura" },
          { label: "Acesso remoto", note: "às máquinas do inventário" },
        ],
      ],
      caption: "Visão geral simplificada: os três apps, o Supabase e as integrações.",
    },
    {
      kind: "bullets",
      title: "Segurança",
      items: [
        "Row Level Security em todas as tabelas, com allowlist: quem não está liberado não lê nada.",
        "Mensagens diretas visíveis só para os participantes.",
        "Cofre de senhas criptografado no navegador (AES-256) com 2FA/TOTP: nem o banco de dados vê as senhas.",
        "O servidor oficial só aceita o aplicativo desktop, como camada extra.",
        "Webhook do GitHub validado por assinatura.",
        "Integração com o Tailscale somente leitura.",
        "Segredos só nas variáveis de ambiente, nunca no repositório.",
      ],
    },
    {
      kind: "bullets",
      title: "Resultado",
      items: [
        "Em produção na equipe de TI.",
        "Release do app desktop via GitHub Releases.",
        "Deploy contínuo, com prévia por Pull Request.",
      ],
    },
  ],
};
