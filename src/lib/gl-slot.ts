/*
 * Um único "dono" de WebGL por vez entre as seções 3D vizinhas (STACK e
 * AUDIT). Cada uma se registra com o seu elemento; o árbitro escolhe a que
 * está mais perto do centro da tela (até 1 tela de distância) e só monta a
 * nova DEPOIS que a anterior terminou de liberar o contexto (unmount pode ser
 * assíncrono, ex.: cena ainda sendo criada). Fora de alcance: ninguém.
 *
 * O hero tem o próprio canvas (loop pausado fora da tela) e não participa.
 */
type Owner = {
  el: Element;
  mount(): void;
  /** libera o contexto; resolve quando ele não existe mais */
  unmount(): void | Promise<void>;
};

const owners = new Set<Owner>();
let active: Owner | null = null;
let busy = false;
let again = false;
let raf = 0;
let listening = false;

/* distância do retângulo até o centro da tela (0 se o contém) */
function distance(o: Owner, vh: number) {
  const r = o.el.getBoundingClientRect();
  if (r.bottom < -vh || r.top > 2 * vh) return Infinity; // longe: sem dono
  const c = vh / 2;
  return r.top > c ? r.top - c : r.bottom < c ? c - r.bottom : 0;
}

function pick() {
  const vh = innerHeight;
  let best: Owner | null = null;
  let bd = Infinity;
  for (const o of owners) {
    const d = distance(o, vh);
    if (d < bd) {
      bd = d;
      best = o;
    }
  }
  /* histerese: só troca de dono se o novo estiver claramente mais perto */
  if (best && active && best !== active && owners.has(active)) {
    const ad = distance(active, vh);
    if (ad !== Infinity && bd > ad - 80) best = active;
  }
  return best;
}

async function arbitrate() {
  raf = 0;
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    const next = pick();
    if (next !== active) {
      const prev = active;
      active = null;
      if (prev) await prev.unmount(); // o contexto anterior some ANTES do novo nascer
      active = next;
      next?.mount();
    }
  } finally {
    busy = false;
    if (again) {
      again = false;
      schedule();
    }
  }
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(() => void arbitrate());
}

export function claimGL(owner: Owner) {
  owners.add(owner);
  if (!listening) {
    listening = true;
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
  }
  schedule();
  return () => {
    owners.delete(owner);
    if (active === owner) {
      active = null;
      void owner.unmount();
    }
    if (!owners.size && listening) {
      listening = false;
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    }
    schedule();
  };
}
