/*
 * Intro do hero: por que ela não rodou. Fica em data-intro-why (também em
 * produção, para diagnóstico) e, no dev, uma vez no console:
 *   [intro] skipped: session | reduced-motion | low-cores | param | input |
 *                    late | slow | no-gpu | error
 */
let logged = false;
export function introSkipped(why: string) {
  const html = document.documentElement;
  if (!html.dataset.introWhy) html.dataset.introWhy = why;
  if (html.dataset.intro === "pending" || html.dataset.intro === "run") html.dataset.intro = "done";
  if (process.env.NODE_ENV !== "production" && !logged) {
    logged = true;
    console.info(`[intro] skipped: ${html.dataset.introWhy}`);
  }
}
