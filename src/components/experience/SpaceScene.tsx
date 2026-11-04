"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, Effect, ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { lerp, seg, smooth, travel } from "./travel";

/*
 * ============================================================
 * CENA 3D REALISTA: espaço -> Terra -> topo das nuvens
 * ============================================================
 *
 * - Texturas NASA (Blue Marble / Black Marble) via Solar System
 *   Scope (CC BY 4.0).
 * - Atmosfera com espalhamento Rayleigh + Mie de verdade
 *   (azul no limbo, laranja/vermelho no terminador).
 * - Oceano com reflexo especular e Fresnel, sombra das nuvens
 *   no solo, luzes das cidades apagadas sob as nuvens.
 * - Via Láctea real ao fundo + estrelas pontuais com cor por
 *   temperatura.
 * - HDR -> Bloom -> tone mapping AgX (fílmico) -> grão.
 *
 * Unidade: raio da Terra = 2.
 * ============================================================
 */

const R_PLANET = 2;
/*
 * Nuvens: vistas de cima, uma casca com a textura real. A
 * travessia é feita por tufos que voam contra a câmera (CloudPuffs)
 * e pelo véu 2D.
 */
const CLOUD_BASE = 2.01;
const R_ATMO = 2.1;

/* Sol vindo da esquerda, um pouco de trás: Terra "gibosa". */
const SUN = new THREE.Vector3(-3, 1.6, -0.2).normalize();

/*
 * Destino: Atlântico, 7°N 36°W (Zona de Convergência
 * Intertropical: oceano aberto e tempestades frequentes).
 */
const LANDING_LAT = 7;
const LANDING_LON = -36;

/* Converte lat/lon para o espaço local da SphereGeometry do three. */
function latLonToLocal(lat: number, lon: number) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(
    -Math.cos(phi) * Math.sin(theta),
    Math.cos(theta),
    Math.sin(phi) * Math.sin(theta)
  );
}

const LANDING_LOCAL = latLonToLocal(LANDING_LAT, LANDING_LON);

/* Normal do destino no mundo; atualizada a cada frame (a Terra gira). */
const landingWorld = new THREE.Vector3(0, 0, 1);

/*
 * Valores atualizados pela câmera a cada frame e lidos pelos
 * outros componentes. (O R3F copia os uniforms ao montar o
 * material, então cada componente repassa o valor no seu frame.)
 */
const shared = {
  /* Quantidade de tufos de nuvem passando pela câmera (0..1). */
  puffAmount: new THREE.Uniform(0),
  radialBlur: new THREE.Uniform(0),
  windAmount: new THREE.Uniform(0),
  windSpeed: new THREE.Uniform(1),
};

const SUN_INTENSITY = 22;

function textureSet(hiRes: boolean) {
  const base = "/textures/space";
  return {
    day: `${base}/earth-day-${hiRes ? "8k" : "4k"}.jpg`,
    night: `${base}/earth-night-4k.jpg`,
    clouds: `${base}/earth-clouds-4k.jpg`,
    normal: `${base}/earth-normal-4k.jpg`,
    ocean: `${base}/earth-ocean-2k.jpg`,
    sky: `${base}/milky-way-${hiRes ? "8k" : "4k"}.jpg`,
  };
}

/* ============================================================
 * SHADERS
 * ============================================================ */

/* Frame tangente da esfera, para o normal map. */
const earthVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vT;
  varying vec3 vB;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec3 n = normalize(position);
    vec3 t = normalize(vec3(position.z, 0.0, -position.x) + vec3(1e-5, 0.0, 0.0));
    vec3 b = cross(n, t);

    mat3 m = mat3(modelMatrix);
    vN = normalize(m * n);
    vT = normalize(m * t);
    vB = normalize(m * b);

    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const earthFrag = /* glsl */ `
  precision highp float;

  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform sampler2D normalMap;
  uniform sampler2D oceanMap;
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float sunIntensity;
  uniform float cloudShift;

  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vT;
  varying vec3 vB;
  varying vec3 vWorld;

  void main() {
    vec3 N0 = normalize(vN);
    vec3 T = normalize(vT);
    vec3 B = normalize(vB);

    /* Relevo: sutil, como é visto do espaço. */
    vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
    vec3 N = normalize(T * nm.x * 0.45 + B * nm.y * 0.45 + N0 * nm.z);

    vec3 V = normalize(cameraPosition - vWorld);
    vec3 L = sunDir;
    vec3 H = normalize(L + V);

    float muGeo = dot(N0, L);
    float mu = dot(N, L);

    float ocean = texture2D(oceanMap, vUv).r;
    vec3 albedo = texture2D(dayMap, vUv).rgb;

    /* Oceano do Blue Marble é claro demais: escurece um pouco. */
    albedo = mix(albedo, albedo * vec3(0.32, 0.5, 0.72), ocean * 0.85);

    /* Sombra das nuvens (deslocada na direção oposta ao sol). */
    vec2 shUv = vUv + vec2(cloudShift, 0.0) - vec2(dot(L, T), dot(L, B)) * 0.0012;
    float cloudShadow = 1.0 - texture2D(cloudMap, shUv).r * 0.55;

    /* Difuso com terminador suave (luz atravessando a atmosfera). */
    float diffuse = smoothstep(-0.04, 0.25, mu) * max(mu, 0.0) * 0.6 + max(mu, 0.0) * 0.4;

    /* Luz do sol fica avermelhada perto do terminador. */
    vec3 sunColor = mix(vec3(1.0, 0.45, 0.2), vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.3, muGeo));

    vec3 color = albedo * sunColor * diffuse * cloudShadow * sunIntensity * 0.07;

    /* Reflexo do sol no oceano (Blinn-Phong + Fresnel de Schlick). */
    float NdotH = max(dot(N0, H), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N0, V), 0.0), 5.0);
    float glint = pow(NdotH, 900.0) * 1.2 + pow(NdotH, 90.0) * 0.04;
    color += sunColor * glint * (0.3 + fres) * ocean * cloudShadow * step(0.0, muGeo) * sunIntensity * 0.06;

    /* Luzes das cidades: só no escuro, apagadas pelas nuvens. */
    float night = 1.0 - smoothstep(-0.18, 0.04, muGeo);
    vec3 lights = texture2D(nightMap, vUv).rgb;
    float lum = dot(lights, vec3(0.3, 0.5, 0.2));
    lights = vec3(pow(max(lum - 0.1, 0.0) / 0.9, 2.0)) * vec3(1.0, 0.68, 0.36);
    float cloudOver = texture2D(cloudMap, vUv + vec2(cloudShift, 0.0)).r;
    color += lights * night * (1.0 - cloudOver * 0.85) * 3.0;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const cloudVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vDir;
  void main() {
    vUv = uv;
    vDir = normalize(position);
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const cloudFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D cloudMap;
  uniform vec3 sunDir;
  uniform float sunIntensity;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vWorld;

  void main() {
    float c = texture2D(cloudMap, vUv).r;
    float density = smoothstep(0.06, 0.85, c);
    if (density < 0.01) discard;

    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    float mu = dot(N, sunDir);

    float lit = smoothstep(-0.01, 0.28, mu);
    vec3 sunColor = mix(vec3(1.0, 0.5, 0.25), vec3(1.0, 0.98, 0.95), smoothstep(0.02, 0.3, mu));
    float thick = 0.55 + 0.45 * density;

    float grazing = 1.0 - max(dot(N, V), 0.0);
    float alpha = clamp(density * (0.85 + grazing * 0.4), 0.0, 1.0);


    gl_FragColor = vec4(sunColor * lit * thick * sunIntensity * 0.046, alpha);
    #include <colorspace_fragment>
  }
`;

/*
 * Espalhamento atmosférico (single scattering, Rayleigh + Mie).
 * Alturas exageradas ~6x para ficar visível nessa escala, com os
 * coeficientes compensados para manter a densidade ótica real.
 */
const atmoVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const atmoFrag = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;

  uniform vec3 sunDir;
  uniform float sunIntensity;
  uniform float rPlanet;
  uniform float rAtmo;

  const float HR = 0.016;
  const float HM = 0.005;
  const vec3 BETA_R = vec3(2.9, 6.8, 16.7);
  const float BETA_M = 2.5;
  const float G = 0.76;
  const int VIEW_STEPS = 14;
  const int LIGHT_STEPS = 4;
  const float PI = 3.14159265;

  vec2 raySphere(vec3 ro, vec3 rd, float r) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - r * r;
    float h = b * b - c;
    if (h < 0.0) return vec2(1e9, -1e9);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - cameraPosition);

    vec2 ta = raySphere(ro, rd, rAtmo);
    float t0 = max(ta.x, 0.0);
    float t1 = ta.y;
    vec2 tp = raySphere(ro, rd, rPlanet);
    if (tp.x > 0.0) t1 = min(t1, tp.x);
    if (t1 <= t0) discard;

    float ds = (t1 - t0) / float(VIEW_STEPS);

    /* Dither por pixel: elimina o efeito de "degraus". */
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 od = vec2(0.0);
    vec3 sumR = vec3(0.0);
    vec3 sumM = vec3(0.0);

    for (int i = 0; i < VIEW_STEPS; i++) {
      vec3 p = ro + rd * (t0 + ds * (float(i) + jitter));
      float h = length(p) - rPlanet;
      vec2 d = vec2(exp(-h / HR), exp(-h / HM)) * ds;
      od += d;

      /* Sombra do planeta, com penumbra suave. */
      float along = dot(p, sunDir);
      float closest = length(p - sunDir * min(along, 0.0));
      float lit = smoothstep(rPlanet - 0.005, rPlanet + 0.03, closest);
      if (lit <= 0.0) continue;

      float tl = raySphere(p, sunDir, rAtmo).y;
      float dl = tl / float(LIGHT_STEPS);
      vec2 odl = vec2(0.0);
      for (int j = 0; j < LIGHT_STEPS; j++) {
        vec3 q = p + sunDir * dl * (float(j) + 0.5);
        float hq = length(q) - rPlanet;
        odl += vec2(exp(-hq / HR), exp(-hq / HM)) * dl;
      }

      vec3 tau = BETA_R * (od.x + odl.x) + BETA_M * 1.1 * (od.y + odl.y);
      vec3 att = exp(-tau);
      sumR += d.x * att * lit;
      sumM += d.y * att * lit;
    }

    float mu = dot(rd, sunDir);
    float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
    float g2 = G * G;
    float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) /
                   ((2.0 + g2) * pow(1.0 + g2 - 2.0 * G * mu, 1.5));

    vec3 color = sunIntensity * (sumR * BETA_R * phaseR + sumM * BETA_M * phaseM);

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/* Estrelas: discos suaves com cor de temperatura, tamanho fixo em px. */
const starVert = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float pixelRatio;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`;

const starFrag = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  uniform float opacity;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float a = exp(-r * r * 4.0);
    if (a < 0.02) discard;
    gl_FragColor = vec4(vColor * a * opacity, 1.0);
    #include <colorspace_fragment>
  }
`;

/* ============================================================
 * TERRA
 * ============================================================ */

function configureTextures(
  gl: THREE.WebGLRenderer,
  color: THREE.Texture[],
  data: THREE.Texture[]
) {
  const aniso = Math.min(gl.capabilities.getMaxAnisotropy(), 16);
  for (const t of [...color, ...data]) {
    t.anisotropy = aniso;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
  }
  for (const t of color) t.colorSpace = THREE.SRGBColorSpace;
  for (const t of data) t.colorSpace = THREE.NoColorSpace;
}

/*
 * O planeta não gira (na escala real é imperceptível): assim o
 * destino fica sempre no lado do dia, por mais que se espere no
 * hero ou se vá e volte. Só as nuvens derivam devagar.
 */
const CLOUD_DRIFT = 0.0008;

function Earth({ hiRes, onReady }: { hiRes: boolean; onReady: () => void }) {
  const planetRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Group>(null);
  const gl = useThree((s) => s.gl);
  const urls = textureSet(hiRes);

  const [day, night, clouds, normal, ocean] = useLoader(THREE.TextureLoader, [
    urls.day,
    urls.night,
    urls.clouds,
    urls.normal,
    urls.ocean,
  ]);

  useMemo(
    () => configureTextures(gl, [day, night], [clouds, normal, ocean]),
    [gl, day, night, clouds, normal, ocean]
  );

  const earthUniforms = useMemo(
    () => ({
      dayMap: { value: day },
      nightMap: { value: night },
      normalMap: { value: normal },
      oceanMap: { value: ocean },
      cloudMap: { value: clouds },
      sunDir: { value: SUN },
      sunIntensity: { value: SUN_INTENSITY },
      cloudShift: { value: 0 },
    }),
    [day, night, normal, ocean, clouds]
  );

  const cloudUniforms = useMemo(
    () => ({
      cloudMap: { value: clouds },
      sunDir: { value: SUN },
      sunIntensity: { value: SUN_INTENSITY },
    }),
    [clouds]
  );

  const earthMatRef = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useFrame((_, delta) => {
    const planet = planetRef.current;
    const cl = cloudsRef.current;
    const mat = earthMatRef.current;
    if (!planet || !cl || !mat) return;

    cl.rotation.y += delta * CLOUD_DRIFT;

    /* A sombra das nuvens acompanha a deriva. */
    mat.uniforms.cloudShift.value = -(cl.rotation.y - planet.rotation.y) / (Math.PI * 2);


    /* Onde está o destino agora, no mundo. */
    planet.updateWorldMatrix(true, false);
    landingWorld.copy(LANDING_LOCAL).transformDirection(planet.matrixWorld);
  });

  /* Orientação escolhida para o destino ficar de dia e de frente. */
  return (
    <group rotation={[0.18, -1.92, -0.1]}>
      <mesh ref={planetRef}>
        <sphereGeometry args={[R_PLANET, 192, 192]} />
        <shaderMaterial
          ref={earthMatRef}
          vertexShader={earthVert}
          fragmentShader={earthFrag}
          uniforms={earthUniforms}
        />
      </mesh>
      <group ref={cloudsRef}>
        <mesh renderOrder={1}>
          <sphereGeometry args={[CLOUD_BASE, 192, 192]} />
          <shaderMaterial
            vertexShader={cloudVert}
            fragmentShader={cloudFrag}
            uniforms={cloudUniforms}
            transparent
            depthWrite={false}
          />
        </mesh>
      </group>

    </group>
  );
}

function Atmosphere() {
  const uniforms = useMemo(
    () => ({
      sunDir: { value: SUN },
      sunIntensity: { value: SUN_INTENSITY },
      rPlanet: { value: R_PLANET },
      rAtmo: { value: R_ATMO },
    }),
    []
  );

  return (
    <mesh renderOrder={10}>
      <sphereGeometry args={[R_ATMO, 128, 128]} />
      <shaderMaterial
        vertexShader={atmoVert}
        fragmentShader={atmoFrag}
        uniforms={uniforms}
        side={THREE.BackSide}
        blending={THREE.AdditiveBlending}
        transparent
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

/* ============================================================
 * UNIVERSO
 * ============================================================ */

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Cor aproximada de corpo negro (classes O..M). */
function starColor(r: number): [number, number, number] {
  if (r < 0.03) return [0.62, 0.72, 1.0]; // O/B: azul
  if (r < 0.15) return [0.8, 0.86, 1.0]; // A: branco-azulado
  if (r < 0.35) return [1.0, 0.98, 0.95]; // F
  if (r < 0.6) return [1.0, 0.93, 0.8]; // G: amarelado (Sol)
  if (r < 0.85) return [1.0, 0.82, 0.62]; // K: laranja
  return [1.0, 0.7, 0.5]; // M: vermelho
}

/* Via Láctea real (mapa equirretangular do céu). */
function MilkyWay({ hiRes }: { hiRes: boolean }) {
  const gl = useThree((s) => s.gl);
  const tex = useLoader(THREE.TextureLoader, textureSet(hiRes).sky);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  useMemo(() => configureTextures(gl, [tex], []), [gl, tex]);

  useFrame(() => {
    if (matRef.current) {
      /* Some quando entramos na atmosfera (céu fica azul). */
      matRef.current.opacity = 1 - smooth(seg(travel.progress, 0.5, 0.66));
    }
  });

  return (
    /* Inclinação: a faixa da galáxia atravessa a tela na diagonal. */
    <mesh rotation={[0.9, 2.2, 0.5]} renderOrder={-1}>
      <sphereGeometry args={[400, 64, 32]} />
      <meshBasicMaterial
        ref={matRef}
        map={tex}
        side={THREE.BackSide}
        color={new THREE.Color(0.6, 0.6, 0.64)}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function Stars() {
  const gl = useThree((s) => s.gl);

  const geometry = useMemo(() => {
    const rnd = mulberry32(7);
    const N = 4200;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const size = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const r = 300;
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);

      /* Magnitudes: muitas estrelas fracas, raras brilhantes. */
      const m = Math.pow(rnd(), 9);
      const b = 0.12 + m * 3.5;
      const [cr, cg, cb] = starColor(rnd());
      col[i * 3] = cr * b;
      col[i * 3 + 1] = cg * b;
      col[i * 3 + 2] = cb * b;
      size[i] = 1.6 + m * 3.2;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1));

    return g;
  }, []);

  const uniforms = useMemo(() => ({ pixelRatio: { value: 1 }, opacity: { value: 1 } }), []);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    m.uniforms.pixelRatio.value = gl.getPixelRatio();
    m.uniforms.opacity.value = 1 - smooth(seg(travel.progress, 0.48, 0.64));
  });

  return (
    <points geometry={geometry} renderOrder={-1}>
      <shaderMaterial
        ref={matRef}
        vertexShader={starVert}
        fragmentShader={starFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ============================================================
 * CÂMERA
 * ============================================================ */

/*
 * TRAJETÓRIA
 *
 * A câmera percorre um arco de círculo máximo, do ponto de
 * partida até o destino no oceano, enquanto perde altitude.
 * Longe, o movimento é quase todo "para dentro"; perto, quase
 * todo "para frente": parece uma reentrada planando, não um zoom.
 *
 * [progresso, fração do arco, altitude]
 */
const PATH_KEYS: [number, number, number][] = [
  [0.0, 0.0, -1], // altitude inicial vem do enquadramento
  [0.16, 0.08, 6.2],
  [0.36, 0.5, 1.7],
  [0.5, 0.8, 0.4],
  [0.6, 0.93, 0.1],
  /*
   * A câmera estaciona ACIMA das nuvens (topo ~0.01) e continua
   * só avançando: quem faz a travessia são os tufos + o véu.
   * Assim o oceano de perto nunca aparece.
   */
  [0.7, 0.99, 0.045],
  [0.8, 1.02, 0.036],
  [1.0, 1.05, 0.032],
];

/* Interpolação cúbica monótona (Fritsch–Carlson): sem trancos. */
function monotone(xs: number[], ys: number[]) {
  const n = xs.length;
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m.push(0); // parte do repouso
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const hgt = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / hgt;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * hgt * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * hgt * m[i + 1]
    );
  };
}

function makePath(startAlt: number) {
  const ps = PATH_KEYS.map((k) => k[0]);
  const arc = monotone(ps, PATH_KEYS.map((k) => k[1]));
  /* Altitude em escala log: velocidade relativa ao solo constante. */
  const logAlt = monotone(
    ps,
    PATH_KEYS.map((k, i) => Math.log(i === 0 ? startAlt : k[2]))
  );
  return { arc, alt: (p: number) => Math.exp(logAlt(p)) };
}

function getFraming(aspect: number) {
  /* Retrato: Terra embaixo, texto em cima. Paisagem: Terra à esquerda. */
  if (aspect < 0.9) {
    return {
      start: new THREE.Vector3(0, 0.2, 15),
      target: new THREE.Vector3(0, 2.9, 0),
    };
  }
  return {
    start: new THREE.Vector3(0, 0.3, 10.5),
    target: new THREE.Vector3(2.15, 0.1, 0),
  };
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const tmpAxis = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const posA = new THREE.Vector3();
const posB = new THREE.Vector3();
const vel = new THREE.Vector3();
const look = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const radial = new THREE.Vector3();
const upVec = new THREE.Vector3();

function CameraRig({ start, target }: { start: THREE.Vector3; target: THREE.Vector3 }) {
  const startDir = useMemo(() => start.clone().normalize(), [start]);
  const path = useMemo(() => makePath(start.length() - R_PLANET), [start]);
  const pointer = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const p = travel.progress;
    const t = state.clock.elapsedTime;

    /* Posição no arco: startDir girado em direção ao destino. */
    tmpAxis.crossVectors(startDir, landingWorld);
    const total = Math.asin(Math.min(tmpAxis.length(), 1));
    const totalAngle = startDir.dot(landingWorld) < 0 ? Math.PI - total : total;
    tmpAxis.normalize();

    const positionAt = (q: number, out: THREE.Vector3) => {
      tmpQ.setFromAxisAngle(tmpAxis, totalAngle * path.arc(q));
      return out.copy(startDir).applyQuaternion(tmpQ).multiplyScalar(R_PLANET + path.alt(q));
    };

    positionAt(p, posA);
    positionAt(Math.min(p + 0.004, 1.02), posB);
    vel.subVectors(posB, posA).normalize();
    radial.copy(posA).normalize();

    camera.position.copy(posA);

    /* Parallax do mouse + flutuação leve, só no hero. */
    const hero = 1 - smooth(seg(p, 0, 0.06));
    const k = 1 - Math.exp(-delta * 2.5);
    pointer.current.x += (travel.pointerX - pointer.current.x) * k;
    pointer.current.y += (travel.pointerY - pointer.current.y) * k;
    camera.position.x += (pointer.current.x * 0.3 + Math.sin(t * 0.13) * 0.06) * hero;
    camera.position.y += (-pointer.current.y * 0.18 + Math.sin(t * 0.11) * 0.04) * hero;

    /*
     * OLHAR: no começo, para o enquadramento do hero; depois,
     * para onde a câmera está indo (direção da velocidade).
     * Na planagem, levanta o nariz para mostrar o horizonte;
     * no fim, mergulha nas nuvens.
     */
    lookTarget
      .copy(target)
      .multiplyScalar(1 - smooth(seg(p, 0, 0.28)))
      .sub(camera.position)
      .normalize();

    look.copy(lookTarget).lerp(vel, smooth(seg(p, 0.08, 0.4))).normalize();

    const noseUp = 0.32 * smooth(seg(p, 0.4, 0.58)) * (1 - smooth(seg(p, 0.62, 0.72)) * 0.6);
    look.addScaledVector(radial, noseUp).normalize();

    upVec.copy(WORLD_UP).lerp(radial, smooth(seg(p, 0.25, 0.55))).normalize();
    camera.up.copy(upVec);
    camera.lookAt(posB.copy(camera.position).add(look));

    /* Inclinação lateral suave (curva), como um avião ajustando a rota. */
    camera.rotateZ(0.16 * Math.sin(Math.PI * seg(p, 0.3, 0.78)));

    /* Turbulência: só no ar denso, baixa frequência (não "tremedeira"). */
    const buffet =
      smooth(seg(p, 0.5, 0.6)) * (1 - smooth(seg(p, 0.8, 0.86))) * 0.0045;
    if (buffet > 0) {
      camera.rotateX((Math.sin(t * 6.1) + 0.6 * Math.sin(t * 13.7 + 1.3)) * buffet);
      camera.rotateY((Math.sin(t * 5.3 + 2.1) + 0.6 * Math.sin(t * 11.9)) * buffet);
    }

    /* Velocidade percebida: alimenta blur radial, vento e lente. */
    const speed =
      smooth(seg(p, 0.3, 0.5)) * (1 - 0.35 * smooth(seg(p, 0.6, 0.66))) +
      0.4 * Math.sin(Math.PI * seg(p, 0.62, 0.8));

    shared.radialBlur.value = speed * 0.045;
    shared.windAmount.value = smooth(seg(p, 0.52, 0.62)) * (1 - smooth(seg(p, 0.78, 0.84)));
    shared.windSpeed.value = 0.6 + speed * 1.6;
    shared.puffAmount.value = smooth(seg(p, 0.59, 0.72)) * (1 - smooth(seg(p, 0.8, 0.86)));

    const fov = lerp(28, 50, smooth(seg(p, 0.22, 0.58))) + speed * 9;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

/* ============================================================
 * VELOCIDADE: vento + blur radial
 * ============================================================ */

/*
 * Linhas de vento presas à câmera, vindo de frente. Mostram a
 * velocidade e o ar ficando denso (atmosfera, nuvens).
 */
const windVert = /* glsl */ `
  attribute float endFlag;
  uniform float time;
  uniform float speed;
  varying float vFade;
  void main() {
    vec3 p = position;
    float range = 6.0;
    float z = mod(p.z + time * speed * 7.0, range) - range; // -range..0 (à frente)
    z += endFlag * (0.08 + speed * 0.3);                    // comprimento ~ velocidade
    vFade = smoothstep(-range, -range * 0.6, z) * (1.0 - smoothstep(-0.6, 0.0, z));
    vec4 mv = modelViewMatrix * vec4(p.xy, z, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const windFrag = /* glsl */ `
  precision highp float;
  uniform float amount;
  varying float vFade;
  void main() {
    gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * vFade * amount * 0.11, 1.0);
    #include <colorspace_fragment>
  }
`;

function Wind() {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const rnd = mulberry32(99);
    const N = 220;
    const pos = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = 0.9 + Math.pow(rnd(), 0.5) * 2.2;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r * 0.75;
      const z = rnd() * 6;
      pos.set([x, y, z, x, y, z], i * 6);
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("endFlag", new THREE.BufferAttribute(end, 1));
    return g;
  }, []);

  const uniforms = useMemo(
    () => ({ time: { value: 0 }, speed: { value: 1 }, amount: { value: 0 } }),
    []
  );

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    const g = groupRef.current;
    const m = matRef.current;
    if (!g || !m) return;
    g.visible = shared.windAmount.value > 0.002;
    m.uniforms.time.value = state.clock.elapsedTime;
    m.uniforms.speed.value = shared.windSpeed.value;
    m.uniforms.amount.value = shared.windAmount.value;

    /* Acompanha a câmera; escala acompanha a altitude (cena enorme vs. perto). */
    g.position.copy(state.camera.position);
    g.quaternion.copy(state.camera.quaternion);
    const h = state.camera.position.length() - R_PLANET;
    g.scale.setScalar(THREE.MathUtils.clamp(h * 0.25, 0.004, 0.08));
  });

  return (
    <group ref={groupRef} visible={false}>
      <lineSegments geometry={geometry} frustumCulled={false} renderOrder={20}>
        <shaderMaterial
          ref={matRef}
          vertexShader={windVert}
          fragmentShader={windFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

/*
 * TUFOS DE NUVEM
 *
 * Sprites com textura de nuvem gerada no navegador, presos à
 * câmera e voando contra ela. Começam esparsos e vão ficando
 * densos até a tela fechar em branco (aí entra o véu 2D).
 * Bem mais leve que nuvem volumétrica.
 */
function makePuffTexture(seed: number, size = 192) {
  const rnd = mulberry32(seed);
  const G = 16;
  const lattice = Float32Array.from({ length: G * G }, () => rnd());
  const at = (x: number, y: number) =>
    lattice[(((y % G) + G) % G) * G + (((x % G) + G) % G)];
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      let n = 0;
      let amp = 0.5;
      let f = 3;
      for (let o = 0; o < 4; o++) {
        n += noise(nx * f, ny * f) * amp;
        amp *= 0.5;
        f *= 2;
      }
      n /= 0.9375;
      const r = Math.hypot(nx - 0.5, ny - 0.5) * 2;
      const falloff = 1 - smooth(Math.min(Math.max((r - 0.35) / 0.65, 0), 1));
      const a = smooth(Math.min(Math.max((n * falloff - 0.22) / 0.4, 0), 1));
      /* Base levemente sombreada, topo claro. */
      const shade = 0.82 + 0.18 * (1 - ny) + (n - 0.5) * 0.2;
      const i = (y * size + x) * 4;
      img.data[i] = 255 * Math.min(shade, 1);
      img.data[i + 1] = 255 * Math.min(shade * 1.01, 1);
      img.data[i + 2] = 255 * Math.min(shade * 1.04, 1);
      img.data[i + 3] = 255 * a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PUFFS = 46;
const PUFF_RANGE = 9;

function CloudPuffs() {
  const groupRef = useRef<THREE.Group>(null);
  const textures = useMemo(() => [11, 23, 37, 51].map((s) => makePuffTexture(s)), []);

  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  /* Disposição inicial determinística (cada tufo guarda seus dados). */
  const seeds = useMemo(() => {
    const rnd = mulberry32(5);
    return Array.from({ length: PUFFS }, (_, i) => ({
      key: i,
      tex: i % 4,
      x: (rnd() - 0.5) * 7,
      y: (rnd() - 0.65) * 3.2, // mais nuvens abaixo da linha do olhar
      z: -rnd() * PUFF_RANGE,
      size: 1.6 + rnd() * 2.6,
      speed: 0.8 + rnd() * 0.5,
      gate: rnd(), // ordem em que aparecem conforme a densidade sobe
    }));
  }, []);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const amount = shared.puffAmount.value;
    g.visible = amount > 0.002;
    if (!g.visible) return;

    g.position.copy(state.camera.position);
    g.quaternion.copy(state.camera.quaternion);
    const h = state.camera.position.length() - R_PLANET;
    g.scale.setScalar(THREE.MathUtils.clamp(h * 0.12, 0.002, 0.05));

    const v = (2.5 + shared.windSpeed.value * 3) * delta;

    for (const child of g.children) {
      const sprite = child as THREE.Sprite;
      const d = sprite.userData as { speed: number; gate: number; x: number; y: number };
      sprite.position.z += v * d.speed;

      /* Passou da câmera: volta lá para frente em outra posição. */
      if (sprite.position.z > 0.2) {
        sprite.position.z -= PUFF_RANGE;
        sprite.position.x = d.x * (0.6 + Math.random() * 0.8);
        sprite.position.y = d.y * (0.6 + Math.random() * 0.8);
      }

      /* Aparece de longe, some antes de "bater" na lente. */
      const z = sprite.position.z;
      const fade =
        smooth(seg(z, -PUFF_RANGE, -PUFF_RANGE * 0.7)) * (1 - smooth(seg(z, -0.9, 0.1)));
      const on = smooth(seg(amount, d.gate * 0.7, d.gate * 0.7 + 0.3));
      (sprite.material as THREE.SpriteMaterial).opacity = fade * on * 0.92;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {seeds.map((s) => (
        <sprite
          key={s.key}
          position={[s.x, s.y, s.z]}
          scale={[s.size * 1.6, s.size, 1]}
          userData={{ speed: s.speed, gate: s.gate, x: s.x, y: s.y }}
          renderOrder={15}
        >
          <spriteMaterial
            map={textures[s.tex]}
            transparent
            depthWrite={false}
            depthTest={false}
            opacity={0}
            fog={false}
          />
        </sprite>
      ))}
    </group>
  );
}

/*
 * Resolução adaptativa: qualidade alta parado no hero, 1x durante
 * o voo (é quando a GPU mais trabalha e o movimento esconde).
 */
function AdaptiveDpr() {
  const setDpr = useThree((s) => s.setDpr);
  const flying = useRef(false);

  useFrame(() => {
    const f = travel.progress > 0.04;
    if (f === flying.current) return;
    flying.current = f;
    setDpr(f ? 1 : Math.min(window.devicePixelRatio, 1.5));
  });

  return null;
}

/* Blur radial (zoom blur) proporcional à velocidade. */
class RadialBlurEffect extends Effect {
  constructor(strength: THREE.Uniform<number>) {
    super(
      "RadialBlurEffect",
      /* glsl */ `
        uniform float strength;
        void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
          if (strength < 0.0005) { outputColor = inputColor; return; }
          vec2 dir = uv - vec2(0.5);
          float edge = smoothstep(0.05, 0.7, length(dir));
          vec4 acc = vec4(0.0);
          for (int i = 0; i < 12; i++) {
            float k = float(i) / 11.0;
            acc += texture2D(inputBuffer, uv - dir * strength * edge * k);
          }
          outputColor = acc / 12.0;
        }
      `,
      { uniforms: new Map<string, THREE.Uniform>([["strength", strength]]) }
    );
  }
}

function RadialBlur() {
  const effect = useMemo(() => new RadialBlurEffect(shared.radialBlur), []);
  useEffect(() => () => effect.dispose(), [effect]);
  return <primitive object={effect} />;
}

/* ============================================================
 * CENA
 * ============================================================ */

/* 8K só em telas grandes; celular fica com 4K (memória de GPU). */
function useHiRes() {
  const gl = useThree((s) => s.gl);
  return useMemo(() => {
    const max = gl.capabilities.maxTextureSize;
    return max >= 8192 && Math.max(window.screen.width, window.screen.height) >= 1200;
  }, [gl]);
}

function World({ onReady }: { onReady: () => void }) {
  const size = useThree((s) => s.size);
  const aspect = size.width / size.height;
  const framing = useMemo(() => getFraming(aspect), [aspect]);
  const hiRes = useHiRes();

  return (
    <>
      <CameraRig start={framing.start} target={framing.target} />

      <Suspense fallback={null}>
        <MilkyWay hiRes={hiRes} />
      </Suspense>
      <Stars />

      <Suspense fallback={null}>
        <Earth hiRes={hiRes} onReady={onReady} />
      </Suspense>

      <Atmosphere />
      <Wind />
      <CloudPuffs />
      <AdaptiveDpr />

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <RadialBlur />
        <Bloom
          mipmapBlur
          intensity={0.4}
          luminanceThreshold={1.0}
          luminanceSmoothing={0.25}
          radius={0.7}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.07} />
      </EffectComposer>
    </>
  );
}

export default function SpaceScene({
  active,
  onReady,
}: {
  active: boolean;
  onReady: () => void;
}) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.5]}
      camera={{ fov: 28, near: 0.002, far: 1000, position: [0, 0.35, 11] }}
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        alpha: false,
        stencil: false,
        toneMapping: THREE.NoToneMapping,
      }}
      className="!absolute inset-0"
    >
      <color attach="background" args={["#000"]} />
      <World onReady={onReady} />
    </Canvas>
  );
}
