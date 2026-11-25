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
  | { kind: "arch"; title: string; body: string[]; routes?: string[]; flow: { label: string; note: string }[]; sources?: string[] };

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
      body: ["TODO: o problema de comunicação e organização do time que o BUMPHUB resolve."],
    },
    {
      kind: "groups",
      title: "O que faz",
      groups: [
        { label: "Conversa", items: "Canais e conversas do time em tempo real, no estilo Discord/Slack." },
        { label: "Gestão", items: "Tasks ligadas ao trabalho no GitHub." },
        { label: "Acesso remoto", items: "Em desenvolvimento: acesso remoto aos computadores da empresa (Windows e Linux), inclusive pelo celular." },
        { label: "TODO", items: "TODO: outros módulos." },
      ],
    },
    {
      kind: "text",
      title: "Como funciona",
      body: ["TODO: fluxo principal (login com GitHub, canais, tasks)."],
    },
    {
      kind: "text",
      title: "Acesso e permissões",
      body: ["TODO: quem acessa o quê (setores, papéis) e como isso é garantido."],
    },
    {
      kind: "bullets",
      title: "Segurança do próprio BUMPHUB",
      items: ["TODO: autenticação e sessões.", "TODO: controle de acesso.", "TODO: proteção do acesso remoto."],
    },
    {
      kind: "arch",
      title: "Arquitetura",
      body: ["TODO: stack, onde roda e como os dados são guardados."],
      flow: [
        { label: "Navegador", note: "TODO" },
        { label: "API", note: "TODO" },
        { label: "Tempo real", note: "TODO" },
        { label: "GitHub", note: "integração de tasks" },
      ],
    },
    {
      kind: "bullets",
      title: "Limitações e próximos passos",
      items: ["Acesso remoto (Windows e Linux, inclusive pelo celular) em desenvolvimento.", "TODO: outros próximos passos."],
    },
  ],
};
