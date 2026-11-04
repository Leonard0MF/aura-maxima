"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, ToneMapping } from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { FLIGHT_END, lerp, seg, smooth, travel } from "./travel";

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
const R_CLOUDS = 2.01;
const R_ATMO = 2.1;

/* Sol vindo da esquerda, um pouco de trás: Terra "gibosa". */
const SUN = new THREE.Vector3(-3, 1.6, -0.2).normalize();

/* Ponto de chegada (normal da superfície, espaço do mundo). */
const LANDING = new THREE.Vector3(-0.62, 0.32, 0.72).normalize();

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
  void main() {
    vUv = uv;
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

    /* Nuvens finas são mais escuras/translúcidas; grossas, brancas. */
    float thick = 0.55 + 0.45 * density;

    /* Nuvens no limbo ficam mais opacas (olhando de lado). */
    float grazing = 1.0 - max(dot(N, V), 0.0);
    float alpha = clamp(density * (0.85 + grazing * 0.4), 0.0, 1.0);

    vec3 col = sunColor * lit * thick * sunIntensity * 0.052;

    gl_FragColor = vec4(col, alpha);
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

const EARTH_SPIN = 0.012;
const CLOUD_SPIN = 0.0135;

function Earth({ hiRes, onReady }: { hiRes: boolean; onReady: () => void }) {
  const planetRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
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

    planet.rotation.y += delta * EARTH_SPIN;
    cl.rotation.y += delta * CLOUD_SPIN;

    /* As nuvens giram um pouco mais rápido: a sombra acompanha. */
    mat.uniforms.cloudShift.value = -(cl.rotation.y - planet.rotation.y) / (Math.PI * 2);
  });

  return (
    <group rotation={[0.18, -Math.PI * 0.42, -0.1]}>
      <mesh ref={planetRef}>
        <sphereGeometry args={[R_PLANET, 192, 192]} />
        <shaderMaterial
          ref={earthMatRef}
          vertexShader={earthVert}
          fragmentShader={earthFrag}
          uniforms={earthUniforms}
        />
      </mesh>
      <mesh ref={cloudsRef} renderOrder={1}>
        <sphereGeometry args={[R_CLOUDS, 160, 160]} />
        <shaderMaterial
          vertexShader={cloudVert}
          fragmentShader={cloudFrag}
          uniforms={cloudUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
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
    <mesh renderOrder={2}>
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

/* [progresso, altitude] (raio do planeta = 2) */
const ALT_KEYS: [number, number][] = [
  [0.0, 1], // substituído pela altitude inicial do enquadramento
  [0.22, 5.2],
  [0.42, 2.0],
  [0.56, 0.6],
  [0.64, 0.16],
  [0.7, 0.06],
  [FLIGHT_END, 0.035],
  [0.9, 0.012],
];

function altitudeAt(p: number, startAlt: number) {
  /* Saída suave do repouso. */
  const q = p < 0.22 ? 0.22 * Math.pow(p / 0.22, 1.6) : p;

  for (let i = 1; i < ALT_KEYS.length; i++) {
    const [p1, a1] = ALT_KEYS[i];
    if (q <= p1) {
      const [p0, a0raw] = ALT_KEYS[i - 1];
      const a0 = i === 1 ? startAlt : a0raw;
      const t = (q - p0) / (p1 - p0);
      return Math.exp(lerp(Math.log(a0), Math.log(a1), t));
    }
  }
  return ALT_KEYS[ALT_KEYS.length - 1][1];
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

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const v5 = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function CameraRig({ start, target }: { start: THREE.Vector3; target: THREE.Vector3 }) {
  /* Direção de "voo rasante" depois de chegar: para o norte. */
  const glide = useMemo(() => {
    const forward = WORLD_UP.clone()
      .addScaledVector(LANDING, -WORLD_UP.dot(LANDING))
      .normalize();
    const axis = LANDING.clone().cross(forward).normalize();
    return { forward, axis };
  }, []);

  const startDir = useMemo(() => start.clone().normalize(), [start]);
  const startAlt = start.length() - R_PLANET;
  const quat = useMemo(() => new THREE.Quaternion(), []);
  const pointer = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const p = travel.progress;
    const t = state.clock.elapsedTime;

    const arrive = smooth(seg(p, 0.38, FLIGHT_END));

    /* Voo rasante: posição e "frente" giram juntos sobre a superfície. */
    quat.setFromAxisAngle(glide.axis, 0.12 * smooth(seg(p, 0.45, 1)));
    const landing = v1.copy(LANDING).applyQuaternion(quat);
    const forward = v2.copy(glide.forward).applyQuaternion(quat);

    const dir = v3.copy(startDir).lerp(landing, smooth(seg(p, 0.05, 0.7))).normalize();
    camera.position.copy(dir).multiplyScalar(R_PLANET + altitudeAt(p, startAlt));

    /* Parallax do mouse + flutuação leve, só no hero. */
    const hero = 1 - smooth(seg(p, 0, 0.08));
    const k = 1 - Math.exp(-delta * 2.5);
    pointer.current.x += (travel.pointerX - pointer.current.x) * k;
    pointer.current.y += (travel.pointerY - pointer.current.y) * k;

    camera.position.x += (pointer.current.x * 0.3 + Math.sin(t * 0.13) * 0.06) * hero;
    camera.position.y += (-pointer.current.y * 0.18 + Math.sin(t * 0.11) * 0.04) * hero;

    /* Turbulência ao entrar na atmosfera. */
    const shake = seg(p, 0.62, 0.72) * (1 - seg(p, 0.85, 0.95)) * 0.0025;
    if (shake > 0) {
      camera.position.x += (Math.sin(t * 41) + 0.5 * Math.sin(t * 77)) * shake;
      camera.position.y += (Math.cos(t * 37) + 0.5 * Math.sin(t * 91)) * shake;
    }

    /* Para onde olhar: do enquadramento do hero até o horizonte. */
    const lookA = v4
      .copy(target)
      .multiplyScalar(1 - smooth(seg(p, 0, 0.32)))
      .sub(camera.position)
      .normalize();

    const pitch = 0.26;
    const lookB = v5
      .copy(forward)
      .multiplyScalar(Math.cos(pitch))
      .addScaledVector(landing, -Math.sin(pitch))
      .normalize();

    const look = lookA.lerp(lookB, arrive).normalize();

    camera.up.copy(WORLD_UP).lerp(landing, arrive).normalize();
    camera.lookAt(v3.copy(camera.position).add(look));

    /* FOV de lente longa no espaço, abre na chegada. */
    const fov =
      lerp(28, 52, smooth(seg(p, 0.3, FLIGHT_END))) +
      Math.sin(Math.PI * seg(p, 0.15, 0.6)) * 7;

    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
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

      <EffectComposer multisampling={0} enableNormalPass={false}>
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
