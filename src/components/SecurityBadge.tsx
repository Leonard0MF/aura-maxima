import { SITE_URL, profile } from "@/content/profile";

const host = new URL(SITE_URL).host;

/* Apenas links: o site não escaneia nada por conta própria. */
export function SecurityBadge() {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-dim">
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-ok" />
      <span>Este site segue boas práticas de segurança ·</span>
      <a
        href={`https://securityheaders.com/?q=${encodeURIComponent(host)}&followRedirects=on`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted underline decoration-line underline-offset-4 hover:text-accent"
      >
        Verifique<span aria-hidden="true"> →</span>
        <span className="sr-only"> (abre securityheaders.com em nova aba)</span>
      </a>
      <span aria-hidden="true">·</span>
      <a
        href={profile.aegisUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted underline decoration-line underline-offset-4 hover:text-accent"
      >
        escaneado com Aegis<span className="sr-only"> (abre em nova aba)</span>
      </a>
    </p>
  );
}
