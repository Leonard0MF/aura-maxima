/*
 * Pré-carga do código pesado (three.js e as cenas 3D: ~590 KB, cuja avaliação
 * custa ~130 ms no desktop e ~300 ms com CPU 4×) logo depois que o hero
 * termina de carregar, em idle — para o parse nunca cair no meio da rolagem.
 *
 * Quando: depois do load, com a intro terminada, no 1º momento ocioso
 * (requestIdleCallback). Cada carga roda num idle próprio, uma de cada vez.
 * No celular, só depois da 1ª rolagem: quem não desce não paga ~590 KB nem
 * a tarefa de avaliação (o celular também não prepara o AUDIT cedo).
 */
type Job = () => Promise<unknown>;
const queue: Job[] = [];
let armed = false;
let open = false;
let busy = false;

const idle = (fn: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));

function pump() {
  if (!open || busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  idle(() =>
    void job()
      .catch(() => {})
      .finally(() => {
        busy = false;
        pump();
      }),
  );
}

function arm() {
  if (armed) return;
  armed = true;
  const html = document.documentElement;
  const ready = () => {
    if (html.dataset.intro === "pending" || html.dataset.intro === "run") return void setTimeout(ready, 300); // intro rodando: depois
    open = true;
    pump();
  };
  const loaded = () => {
    if (!matchMedia("(max-width: 639px)").matches || scrollY > 0) return ready();
    addEventListener("scroll", ready, { once: true, passive: true });
  };
  if (document.readyState === "complete") loaded();
  else addEventListener("load", loaded, { once: true });
}

/** agenda `load` para o 1º momento ocioso depois do hero; devolve o cancelamento */
export function prewarm(load: Job) {
  let done = false;
  const job: Job = () => (done ? Promise.resolve() : load());
  queue.push(job);
  arm();
  pump();
  return () => {
    done = true;
    const i = queue.indexOf(job);
    if (i >= 0) queue.splice(i, 1);
  };
}
