import path from "node:path";

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/*
 * CSP sem nonce para manter as páginas estáticas (SSG).
 * 'unsafe-inline' em script-src é exigido pelos scripts inline do App
 * Router (payload RSC) e pelo script de boot; NUNCA 'unsafe-eval' em produção
 * (só em dev, onde o HMR precisa dele).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  /* CTF · flag 2 de 3. */
  { key: "X-Recon-Flag", value: "LEO{headers_tell_stories}" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  /* Há um package-lock.json vazio na pasta pai; fixa a raiz neste projeto. */
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    /* CSS (Tailwind, ~9 KB gzip) inline no <head>: elimina 1 round-trip
       bloqueante para quem chega pela primeira vez (caso típico de portfólio). */
    inlineCss: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
