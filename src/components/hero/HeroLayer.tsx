import type { CSSProperties } from "react";

import type { AsciiImageData } from "@/lib/ascii/image";
import { portraitBoxStyle } from "@/lib/ascii/core";

/*
 * Conteúdo do hero (tipografia + área do retrato). Renderizado DUAS vezes
 * com o mesmo container, o mesmo CSS e as mesmas classes de layout:
 *
 *   surface  papel: FULL-STACK / DEVELOPER em tinta; no lugar do retrato,
 *            o fallback estático (o canvas ASCII ao vivo fica por cima dele)
 *   under    "por baixo da superfície": fundo escuro, FULL-STACK em contorno
 *            âmbar, PENTESTER em âmbar no lugar de DEVELOPER (cada letra numa
 *            caixa com a largura da letra correspondente de DEVELOPER, medida
 *            no cliente) e a foto no mesmo retângulo do canvas.
 *
 * A diferença entre as duas é só cor e conteúdo, nunca layout. A camada under
 * é recortada por um círculo (clip-path) que segue a lente via variáveis CSS.
 */
export function HeroLayer({ variant, portrait, bg, alt }: { variant: "surface" | "under"; portrait: AsciiImageData; bg?: AsciiImageData; alt: string }) {
  const under = variant === "under";
  return (
    <div className={`hero-layer hero-layer--${variant}`} aria-hidden={under || undefined}>
      {/* Enigma (fundo, atrás do retrato): na superfície, o ASCII fino estático
          (fallback); na lente, a foto real em P&B. Caixa: .hero-enigma-box,
          a mesma conta de enigmaRect() no shader. Decorativa (alt vazio). */}
      {bg && (
        <div className={under ? "hero-enigma-box hero-photo" : "hero-enigma-box ascii-fallback ascii-fallback--bg"} style={{ "--ea": bg.aspect } as CSSProperties}>
          {under ? (
            // eslint-disable-next-line @next/next/no-img-element -- mesma URL da textura do shader
            <img src={bg.src} alt="" decoding="async" loading="eager" style={{ maskImage: `url(${bg.mask})`, WebkitMaskImage: `url(${bg.mask})` }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- data URI gerado no build
            <img src={bg.svg.src} width={bg.svg.width} height={bg.svg.height} alt="" decoding="async" />
          )}
        </div>
      )}
      {/* retrato: o MESMO retângulo que o shader usa (portraitBoxStyle ≡ portraitRect) */}
      <div className={under ? "hero-photo" : "ascii-fallback"} style={portraitBoxStyle(portrait.aspect)}>
        {under ? (
          // eslint-disable-next-line @next/next/no-img-element -- mesma URL da textura do shader (já em cache)
          <img
            src={portrait.src}
            alt=""
            decoding="async"
            /* eager: a camada começa escondida (display: none) e uma imagem lazy
               só carregaria quando a lente abrisse, deixando o círculo vazio */
            loading="eager"
            style={{ maskImage: `url(${portrait.mask})`, WebkitMaskImage: `url(${portrait.mask})` }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- data URI gerado no build, nada a otimizar
          <img
            src={portrait.svg.src}
            width={portrait.svg.width}
            height={portrait.svg.height}
            alt={alt}
            decoding="async"
          />
        )}
      </div>

      <div aria-hidden="true" className="hero-display font-display">
        <span className="hl hl-top">FULL-STACK</span>
        {under ? (
          <span className="hl hl-bot">
            {[..."PENTESTER"].map((ch, i) => (
              <span key={i} className="hl-ch">
                {ch}
              </span>
            ))}
          </span>
        ) : (
          <span className="hl hl-bot">DEVELOPER</span>
        )}
      </div>
    </div>
  );
}
