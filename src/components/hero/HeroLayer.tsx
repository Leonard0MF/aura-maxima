import type { AsciiImageData } from "@/lib/ascii/image";
import { portraitBoxStyle } from "@/lib/ascii/core";
import { profile } from "@/content/profile";

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
export function HeroLayer({ variant, portrait }: { variant: "surface" | "under"; portrait: AsciiImageData }) {
  const under = variant === "under";
  return (
    <div className={`hero-layer hero-layer--${variant}`} aria-hidden={under || undefined}>
      {/* retrato: o MESMO retângulo que o shader usa (portraitBoxStyle ≡ portraitRect) */}
      <div className={under ? "hero-photo" : "ascii-fallback"} style={portraitBoxStyle(portrait.aspect)}>
        {under ? (
          // eslint-disable-next-line @next/next/no-img-element -- mesma URL da textura do shader (já em cache)
          <img src={portrait.src} alt="" decoding="async" loading="lazy" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- data URI gerado no build, nada a otimizar
          <img
            src={portrait.svg.src}
            width={portrait.svg.width}
            height={portrait.svg.height}
            alt={`Retrato de ${profile.name} desenhado com caracteres de código (ASCII art)`}
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
