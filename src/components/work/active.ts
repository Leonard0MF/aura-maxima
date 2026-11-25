/*
 * Qual bloco do WORK está "em cena": o último (na ordem do DOM) que cruza o
 * meio da viewport. Os blocos são sticky e se empilham, então só esse pode
 * ter canvas WebGL; os outros ficam com o ASCII estático.
 */
const blocks = new Set<HTMLElement>();
const subs = new Set<() => void>();
let active: HTMLElement | null = null;
let raf = 0;

function compute() {
  raf = 0;
  const mid = innerHeight / 2;
  let best: HTMLElement | null = null;
  for (const el of blocks) {
    const r = el.getBoundingClientRect();
    if (r.top > mid || r.bottom < mid) continue;
    if (!best || best.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = el;
  }
  if (best !== active) {
    active = best;
    subs.forEach((f) => f());
  }
}
const queue = () => {
  if (!raf) raf = requestAnimationFrame(compute);
};

export function register(el: HTMLElement) {
  if (!blocks.size) {
    addEventListener("scroll", queue, { passive: true });
    addEventListener("resize", queue, { passive: true });
  }
  blocks.add(el);
  queue();
  return () => {
    blocks.delete(el);
    if (!blocks.size) {
      removeEventListener("scroll", queue);
      removeEventListener("resize", queue);
    }
    queue();
  };
}

export function subscribe(f: () => void) {
  subs.add(f);
  return () => void subs.delete(f);
}
export const getActive = () => active;
