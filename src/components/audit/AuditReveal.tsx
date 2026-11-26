"use client";

import { useEffect, useRef } from "react";

import { holeCenter } from "./layout";

/*
 * Entrada do AUDIT: animação de TEMPO, não de rolagem (nada fica preso na
 * tela; a página rola sempre).
 *
 * Quando o topo da seção cruza ~60% da viewport (data-in), um círculo escuro
 * (div de 100 px, border-radius 50%) nasce no centro do buraco negro e cresce
 * SÓ com transform: scale() até cobrir a seção (~900 ms, ease-out). Nada de
 * clip-path: o compositor escala uma camada pronta, sem repintar a área a
 * cada quadro.
 *
 * Dentro dele, uma IMAGEM estática do AUDIT (snapshot do canvas feito pelo
 * AuditField na preparação, em WebP), recortada pelo próprio círculo
 * (overflow hidden + border-radius) e contra-escalada (1/s, mesmos tempos),
 * então fica parada no lugar enquanto a borda abre.
 *
 * O canvas WebGL fica parado até o círculo cobrir a seção (data-done). Aí:
 * o loop liga, o título descriptografa, e quando o 1º quadro ao vivo sai
 * (audit:live) o círculo some num crossfade de 200 ms.
 *
 * Uma vez por entrada: quando a seção sai inteira da tela, volta ao início.
 * Com reduced-motion: fade de 300 ms (CSS). Sem JS: a seção aparece pronta.
 * O modo (data-reveal) é decidido no script de boot, antes da 1ª pintura.
 */
const BASE = 100; // px: diâmetro do círculo antes de escalar
const S0 = 0.02; // escala inicial (2 px)
const DUR = 900;
const STEPS = 48; // quadros-chave da curva (s e 1/s amostrados juntos)
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

export function AuditReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = ref.current!;
    const section = wrap.querySelector<HTMLElement>("section")!;
    const field = section.querySelector<HTMLElement>(".audit-field");
    const iris = wrap.querySelector<HTMLElement>(".audit-iris")!;
    const img = iris.querySelector<HTMLImageElement>("img")!;
    const title = section.querySelector<HTMLElement>(".sh-title [data-decrypt]");
    const reveal = !!document.documentElement.dataset.reveal;
    let rmax = 0;
    let url = "";

    const center = () => {
      const s = section.getBoundingClientRect();
      wrap.style.setProperty("--sw", `${s.width}px`);
      wrap.style.setProperty("--sh", `${s.height}px`);
      if (!field) return;
      const f = field.getBoundingClientRect();
      if (!f.width || !f.height) return;
      const c = holeCenter(f.width, f.height);
      const x = f.left - s.left + c.x, y = f.top - s.top + c.y;
      wrap.style.setProperty("--bhx", `${x.toFixed(1)}px`);
      wrap.style.setProperty("--bhy", `${y.toFixed(1)}px`);
      /* raio que cobre a seção inteira: até o canto mais distante */
      rmax = Math.ceil(Math.hypot(Math.max(x, s.width - x), Math.max(y, s.height - y)) + 2);
    };
    const ro = new ResizeObserver(center);
    ro.observe(section);
    if (field) ro.observe(field);
    center();

    /* snapshot do canvas (AuditField): decodificado antes de precisar */
    const onSnap = (e: Event) => {
      const next = (e as CustomEvent<string>).detail;
      if (url) URL.revokeObjectURL(url);
      url = next;
      img.src = next;
      img.decode().catch(() => {});
    };
    wrap.addEventListener("audit:snapshot", onSnap);

    let anims: Animation[] = [];
    let liveT = 0;
    const stopAll = () => {
      anims.forEach((a) => a.cancel());
      anims = [];
      clearTimeout(liveT);
      section.removeEventListener("audit:live", fade);
      iris.style.willChange = img.style.willChange = "";
      delete iris.dataset.on;
    };
    /* 3. 1º quadro ao vivo na tela (ou 400 ms sem notícia): crossfade e fora */
    function fade() {
      clearTimeout(liveT);
      section.removeEventListener("audit:live", fade);
      if (!("done" in section.dataset)) return;
      const f = iris.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: "linear", fill: "forwards" });
      anims.push(f);
      f.finished.then(stopAll, () => {});
    }
    /* 2. círculo cobriu a seção: loop liga (AuditField), título descriptografa */
    const covered = () => {
      if (!("in" in section.dataset)) return;
      section.addEventListener("audit:live", fade);
      liveT = window.setTimeout(fade, 400);
      section.dataset.done = "";
      title?.dispatchEvent(new Event("decrypt"));
    };
    /* 1. círculo cresce: s(t) no div, 1/s(t) na imagem (fica parada) */
    const grow = () => {
      stopAll();
      center();
      const smax = (2 * rmax) / BASE;
      const outer: Keyframe[] = [];
      const inner: Keyframe[] = [];
      for (let i = 0; i <= STEPS; i++) {
        const s = S0 + (smax - S0) * easeOutExpo(i / STEPS);
        outer.push({ transform: `scale(${s.toFixed(4)})` });
        inner.push({ transform: `scale(${(1 / s).toFixed(4)})` });
      }
      iris.dataset.on = "";
      iris.style.willChange = img.style.willChange = "transform";
      const opt: KeyframeAnimationOptions = { duration: DUR, easing: "linear", fill: "forwards" };
      const a = iris.animate(outer, opt);
      anims.push(a);
      if (img.getAttribute("src")) anims.push(img.animate(inner, opt));
      a.finished.then(covered, () => {});
    };

    /* Os observers olham o .audit-wrap; a decisão lê a geometria de agora
     * (callbacks dos dois observers podem chegar no mesmo lote).
     *  - entra: o topo cruzou 60% da viewport e a seção ainda está na tela
     *  - saiu inteira: volta ao início sem animar, para a próxima entrada */
    const sync = () => {
      const r = wrap.getBoundingClientRect(), vh = innerHeight;
      if (r.top <= vh * 0.6 && r.bottom > 0) {
        if (!("in" in section.dataset)) {
          section.dataset.in = "";
          if (reveal) grow();
          else {
            section.dataset.done = "";
            title?.dispatchEvent(new Event("decrypt"));
          }
        }
      } else if ((r.bottom <= 0 || r.top >= vh) && "in" in section.dataset) {
        stopAll();
        delete section.dataset.in;
        delete section.dataset.done;
      }
    };
    const ioIn = new IntersectionObserver(sync, { rootMargin: "0px 0px -40% 0px" });
    const ioOut = new IntersectionObserver(sync);
    ioIn.observe(wrap);
    ioOut.observe(wrap);
    return () => {
      stopAll();
      ro.disconnect();
      ioIn.disconnect();
      ioOut.disconnect();
      wrap.removeEventListener("audit:snapshot", onSnap);
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  return (
    <div ref={ref} className="audit-wrap">
      {children}
      <div className="audit-iris" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: do snapshot do canvas */}
        <img alt="" decoding="async" />
      </div>
    </div>
  );
}
