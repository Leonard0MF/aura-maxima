/*
 * Árbitro de WebGL entre as seções 3D (hero, STACK e AUDIT).
 *
 * Dois estados separados:
 * - EXISTIR: a seção prepara o contexto (cena criada, shaders compilados,
 *   loop parado) quando chega a ~1,5 viewport de distância e o libera
 *   longe (> 2,5 viewports, em idle). Cada seção pode trocar essas
 *   distâncias (prepareAt/releaseAt) e pedir para existir antes (keep: o
 *   AUDIT nasce quando o usuário chega ao WORK). Os contextos podem existir
 *   juntos.
 * - RENDERIZAR: só UM loop por vez. Renderiza a seção visível com maior
 *   prioridade (o AUDIT, depois que a revelação começou) ou, empatando, a
 *   mais perto do centro da tela. Fora da tela, ninguém.
 *
 * Nunca desmonta e monta no mesmo frame: no máximo uma preparação ou
 * liberação por frame, e liberações têm a vez antes.
 *
 * O hero participa só do "existir" (o canvas dele já pausa sozinho fora da
 * tela, e a WORK fica entre ele e a STACK: nunca divide a tela com elas).
 */
type Owner = {
  el: Element;
  /** cria o contexto com o loop PARADO; resolve quando está pronto */
  prepare(): void | Promise<void>;
  /** libera o contexto; resolve quando ele não existe mais */
  release(): void | Promise<void>;
  /** liga/desliga o loop de render (só chamado com o contexto pronto) */
  run(on: boolean): void;
  /** maior = ganha o render quando as duas estão na tela */
  priority?(): number;
  /** viewports de distância para preparar / liberar (padrão 1,5 / 2,5) */
  prepareAt?: number;
  releaseAt?: number;
  /** true = deve existir já, mesmo longe (e não é liberada enquanto for true) */
  keep?(): boolean;
};
type Slot = { o: Owner; state: "off" | "preparing" | "ready" | "releasing"; running: boolean };

const PREPARE = 1.5; // viewports de distância para preparar
const RELEASE = 2.5; // para liberar (histerese)

const slots = new Map<Owner, Slot>();
let raf = 0;
let listening = false;
let renderer: Slot | null = null;

/* distância (px) do retângulo até a viewport; 0 = visível */
function gap(el: Element, vh: number) {
  const r = el.getBoundingClientRect();
  return r.top > vh ? r.top - vh : r.bottom < 0 ? -r.bottom : 0;
}
function centerDist(el: Element, vh: number) {
  const r = el.getBoundingClientRect();
  const c = vh / 2;
  return r.top > c ? r.top - c : r.bottom < c ? c - r.bottom : 0;
}

const idle = (fn: () => void) =>
  "requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 50);

function arbitrate() {
  raf = 0;
  const vh = innerHeight;

  /* 1. quem renderiza: visível, pronto, maior prioridade, mais perto do centro */
  let best: Slot | null = null;
  let bk = [-Infinity, Infinity];
  for (const s of slots.values()) {
    if (s.state !== "ready" || gap(s.o.el, vh) > 0) continue;
    const k = [s.o.priority?.() ?? 0, centerDist(s.o.el, vh)];
    if (k[0] > bk[0] || (k[0] === bk[0] && k[1] < bk[1])) {
      best = s;
      bk = k;
    }
  }
  /* histerese: com a mesma prioridade, só troca se a nova estiver claramente mais perto */
  if (best && renderer && best !== renderer && renderer.state === "ready" && gap(renderer.o.el, vh) === 0) {
    const rp = renderer.o.priority?.() ?? 0;
    if (rp === bk[0] && centerDist(renderer.o.el, vh) < bk[1] + 80) best = renderer;
  }
  /* para o anterior ANTES de ligar o novo: nunca dois loops */
  for (const s of slots.values()) {
    if (s !== best && s.running) {
      s.running = false;
      s.o.run(false);
    }
  }
  if (best && !best.running) {
    best.running = true;
    best.o.run(true);
  }
  renderer = best;

  /* 2. no máximo uma criação/liberação por frame (liberações primeiro) */
  let op = false;
  for (const s of slots.values()) {
    if (op) break;
    if (s.state === "ready" && gap(s.o.el, vh) > (s.o.releaseAt ?? RELEASE) * vh && !s.o.keep?.()) {
      op = true;
      s.state = "releasing";
      if (s.running) {
        s.running = false;
        s.o.run(false);
      }
      idle(() => void Promise.resolve(s.o.release()).finally(() => done(s, "off")));
    }
  }
  for (const s of slots.values()) {
    if (op) break;
    if (s.state === "off" && (gap(s.o.el, vh) <= (s.o.prepareAt ?? PREPARE) * vh || s.o.keep?.())) {
      op = true;
      s.state = "preparing";
      void Promise.resolve(s.o.prepare())
        .then(() => done(s, "ready"))
        .catch(() => done(s, "off"));
    }
  }
  if (op) schedule(); // o resto fica para os próximos frames
}

function done(s: Slot, state: Slot["state"]) {
  if (slots.get(s.o) === s) s.state = state;
  schedule();
}

/** reavalia no próximo frame (scroll, resize, mudança de prioridade) */
export function schedule() {
  if (!raf) raf = requestAnimationFrame(arbitrate);
}

export function claimGL(owner: Owner) {
  const s: Slot = { o: owner, state: "off", running: false };
  slots.set(owner, s);
  if (!listening) {
    listening = true;
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
  }
  schedule();
  return () => {
    slots.delete(owner);
    if (renderer === s) renderer = null;
    if (s.running) owner.run(false);
    if (s.state !== "off") void owner.release();
    if (!slots.size && listening) {
      listening = false;
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    }
    schedule();
  };
}
