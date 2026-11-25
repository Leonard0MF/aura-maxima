This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Auditoria real (seção AUDIT)

A seção AUDIT mostra a postura de segurança **deste site**, medida pelo Aegis.
Enquanto `src/content/audit.json` tiver `"example": true`, os dados aparecem
marcados como EXEMPLO e **sem nota**. A nota só aparece com um scan real
importado: ela nunca é escrita à mão.

1. **Publicar**: faça o deploy da versão que vai ser medida (os headers de
   segurança vêm de `next.config.ts`).
2. **Escanear**: no Aegis, rode o scan do domínio publicado (o mesmo de
   `SITE_URL` em `src/content/profile.ts`).
3. **Exportar**: no Aegis, abra **Configurações → Exportar JSON**. O download
   se chama `aegis-historico-AAAA-MM-DD.json`.
4. **Importar**:

   ```bash
   npm run audit:import -- ~/Downloads/aegis-historico-AAAA-MM-DD.json
   # outro domínio: --domain meu-dominio.dev
   ```

   O script (`scripts/import-aegis.ts`) pega o scan **mais recente** desse
   domínio no arquivo e regrava `src/content/audit.json` com nota, faixa,
   TLS, headers, cookies, DNS/e-mail, CDN e a data do scan. Ele mostra no
   terminal o que foi importado e avisa se o scan tem mais de 30 dias.
5. **Commitar**: confira com `npm run build` e faça o commit do
   `audit.json`. Os rótulos de EXEMPLO somem e a nota passa a aparecer.

Depois de mudar headers ou hospedagem, repita do passo 1 para a seção não
mostrar um resultado desatualizado.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Créditos

Texturas da Terra e da Via Láctea: [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0), baseadas em dados da NASA.
