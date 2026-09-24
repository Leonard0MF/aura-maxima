"use client";

import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";

/*
 * ============================================================
 * TEXTURAS
 * ============================================================
 */
const TEXTURE_URLS = {
  day: "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
  normal: "https://threejs.org/examples/textures/planets/earth_normal_2048.jpg",
  specular: "https://threejs.org/examples/textures/planets/earth_specular_2048.jpg",
  night: "https://threejs.org/examples/textures/planets/earth_lights_2048.png",
  clouds: "https://threejs.org/examples/textures/planets/earth_clouds_1024.png",
};

/*
 * ============================================================
 * SOL (Ajustado para o ângulo do vídeo)
 * ============================================================
 */
export const SUN_DIRECTION = new THREE.Vector3(-3, 2, 1).normalize();

/*
 * ============================================================
 * ATMOSFERA
 * ============================================================
 */
const atmosphereVertexShader = `
  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const atmosphereFragmentShader = `
  precision highp float;

  varying vec3 vNormalView;
  varying vec3 vViewPosition;
  uniform vec3 sunDirectionView;

  void main() {
    vec3 normal = normalize(vNormalView);
    vec3 viewDirection = normalize(vViewPosition);
    vec3 sun = normalize(sunDirectionView);

    float rim = 1.0 - max(dot(normal, viewDirection), 0.0);
    float horizon = pow(rim, 4.0);
    float sunFacing = max(dot(normal, sun), 0.0);

    vec3 atmosphereColor = vec3(0.08, 0.28, 0.82);
    float alpha = horizon * (0.10 + sunFacing * 0.90) * 0.62;

    gl_FragColor = vec4(atmosphereColor, alpha);
  }
`;

/*
 * ============================================================
 * CLOUDS — VERTEX
 * ============================================================
 */
const cloudVertexShader = `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/*
 * ============================================================
 * CLOUDS — FRAGMENT
 * ============================================================
 */
const cloudFragmentShader = `
  precision highp float;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  uniform sampler2D cloudTexture;
  uniform float cloudTime;
  uniform vec3 sunDirectionView;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += noise(p) * amplitude;
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  vec2 deformUV(vec2 uv, float time) {
    vec2 p = uv;
    p.x += time * 0.010;
    p.x += sin(uv.y * 8.0 + time * 0.40) * 0.020;
    p.y += cos(uv.x * 7.0 - time * 0.32) * 0.015;
    p.x += sin(uv.y * 15.0 - time * 0.22) * 0.006;
    p.y += cos(uv.x * 12.0 + time * 0.25) * 0.005;
    return p;
  }

  void main() {
    vec2 uv = deformUV(vUv, cloudTime);
    vec2 uv2 = uv;
    uv2.x += cloudTime * 0.0035;
    uv2.y -= cloudTime * 0.0012;

    float cloudA = texture2D(cloudTexture, uv).r;
    float cloudB = texture2D(cloudTexture, uv2).r;
    float cloud = mix(cloudA, cloudB, 0.20);

    float largeNoise = fbm(uv * 3.0 + vec2(cloudTime * 0.025, -cloudTime * 0.012));
    float smallNoise = fbm(uv * 8.0 - vec2(cloudTime * 0.018, cloudTime * 0.010));

    cloud *= 0.82 + largeNoise * 0.25;
    cloud += smallNoise * 0.045;

    float density = smoothstep(0.24, 0.68, cloud);

    if (density < 0.018) {
      discard;
    }

    vec3 normal = normalize(vNormalView);
    vec3 viewDirection = normalize(vViewPosition);
    vec3 sun = normalize(sunDirectionView);

    float sunLight = max(dot(normal, sun), 0.0);
    float lighting = 0.30 + sunLight * 0.70;

    float rim = 1.0 - max(dot(normal, viewDirection), 0.0);
    float rimLight = pow(rim, 3.5);

    vec3 cloudColor = vec3(0.90, 0.94, 1.0);
    cloudColor += vec3(0.025, 0.055, 0.12) * rimLight;
    cloudColor *= lighting;

    float alpha = density * 0.46;
    alpha *= 0.55 + density * 0.45;

    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

/*
 * ============================================================
 * EARTH COMPONENT
 * ============================================================
 */
export default function Earth() {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const earthMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
  const cloudMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const atmosphereMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const earthSunUniformRef = useRef<{ value: THREE.Vector3 } | null>(null);

  const { gl, camera } = useThree();
  const sunDirectionView = useMemo(() => new THREE.Vector3(), []);
  const cloudTime = useRef(0);

  const [
    dayTexture,
    normalTexture,
    specularTexture,
    nightTexture,
    cloudsTexture,
  ] = useLoader(THREE.TextureLoader, [
    TEXTURE_URLS.day,
    TEXTURE_URLS.normal,
    TEXTURE_URLS.specular,
    TEXTURE_URLS.night,
    TEXTURE_URLS.clouds,
  ]);

  useEffect(() => {
    const anisotropy = Math.min(gl.capabilities.getMaxAnisotropy(), 8);

    [dayTexture, normalTexture, specularTexture, nightTexture, cloudsTexture].forEach(
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = anisotropy;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
      }
    );

    dayTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    cloudsTexture.colorSpace = THREE.SRGBColorSpace;
    normalTexture.colorSpace = THREE.NoColorSpace;
    specularTexture.colorSpace = THREE.NoColorSpace;
  }, [gl, dayTexture, normalTexture, specularTexture, nightTexture, cloudsTexture]);

  useEffect(() => {
    const material = earthMaterialRef.current;
    if (!material) return;

    material.onBeforeCompile = (shader) => {
      shader.uniforms.nightTexture = { value: nightTexture };
      shader.uniforms.specularTexture = { value: specularTexture };
      shader.uniforms.sunDirectionView = { value: sunDirectionView };
      
      earthSunUniformRef.current = shader.uniforms.sunDirectionView;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>\nvarying vec2 vEarthUv;`
      );

      shader.vertexShader = shader.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>\nvEarthUv = uv;`
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `
          #include <common>
          uniform sampler2D nightTexture;
          uniform sampler2D specularTexture;
          uniform vec3 sunDirectionView;
          varying vec2 vEarthUv;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <output_fragment>",
        `
          #include <output_fragment>

          float oceanMask = texture2D(specularTexture, vEarthUv).r;
          vec3 earthNormal = normalize(vNormal);
          vec3 viewDirection = normalize(-vViewPosition);
          vec3 sun = normalize(sunDirectionView);
          vec3 halfDirection = normalize(sun + viewDirection);

          float sunLight = max(dot(earthNormal, sun), 0.0);
          float oceanSpecular = pow(max(dot(earthNormal, halfDirection), 0.0), 72.0);
          float fresnel = pow(1.0 - max(dot(earthNormal, viewDirection), 0.0), 3.0);

          vec3 oceanColor = vec3(0.07, 0.20, 0.55);
          gl_FragColor.rgb += oceanColor * oceanSpecular * sunLight * oceanMask * 1.7;
          gl_FragColor.rgb += oceanColor * fresnel * oceanMask * 0.09;

          // Terminador nítido ajustado para o visual do vídeo
          float sunAmount = dot(earthNormal, sun);
          float nightAmount = 1.0 - smoothstep(-0.05, 0.10, sunAmount);

          vec3 cityLights = texture2D(nightTexture, vEarthUv).rgb;
          
          // Laranja/Dourado quente intenso 
          cityLights *= vec3(1.0, 0.60, 0.20);
          
          // Intensidade alta multiplicada pela máscara noturna
          cityLights *= nightAmount * 4.0;

          gl_FragColor.rgb += cityLights;
        `
      );

      material.customProgramCacheKey = () => "aura-maxima-earth-v4";
    };

    material.needsUpdate = true;

    return () => {
      earthSunUniformRef.current = null;
      material.onBeforeCompile = undefined;
      material.needsUpdate = true;
    };
  }, [nightTexture, specularTexture, sunDirectionView]);

  useFrame((_, delta) => {
    cloudTime.current += delta;

    if (earthRef.current) earthRef.current.rotation.y += delta * 0.028;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.032;

    sunDirectionView.copy(SUN_DIRECTION).transformDirection(camera.matrixWorldInverse);

    if (earthSunUniformRef.current) earthSunUniformRef.current.value.copy(sunDirectionView);
    
    if (cloudMaterialRef.current) {
      cloudMaterialRef.current.uniforms.cloudTime.value = cloudTime.current;
      cloudMaterialRef.current.uniforms.sunDirectionView.value.copy(sunDirectionView);
    }
    
    if (atmosphereMaterialRef.current) {
      atmosphereMaterialRef.current.uniforms.sunDirectionView.value.copy(sunDirectionView);
    }
  });

  return (
    <group
      position={[0, -0.5, 0]}
      // Rotação inicial ajustada para focar nas Américas (como no vídeo)
      rotation={[0.16, -Math.PI * 0.45, -0.12]}
    >
      <directionalLight
        position={[
          SUN_DIRECTION.x * 10,
          SUN_DIRECTION.y * 10,
          SUN_DIRECTION.z * 10,
        ]}
        intensity={2.7}
      />
      <directionalLight position={[3, -2, -4]} intensity={0.30} color="#4268a8" />
      <ambientLight intensity={0.12} />

      <mesh ref={earthRef}>
        <sphereGeometry args={[2, 128, 128]} />
        <meshStandardMaterial
          ref={earthMaterialRef}
          map={dayTexture}
          normalMap={normalTexture}
          normalScale={new THREE.Vector2(0.95, 0.95)}
          roughness={0.68}
          metalness={0}
          envMapIntensity={0.45}
        />
      </mesh>

      <mesh ref={cloudsRef} scale={1.014} renderOrder={2}>
        <sphereGeometry args={[2, 96, 96]} />
        <shaderMaterial
          ref={cloudMaterialRef}
          vertexShader={cloudVertexShader}
          fragmentShader={cloudFragmentShader}
          uniforms={{
            cloudTexture: { value: cloudsTexture },
            cloudTime: { value: 0 },
            sunDirectionView: { value: sunDirectionView },
          }}
          transparent
          depthWrite={false}
          depthTest={true}
          side={THREE.FrontSide}
          blending={THREE.NormalBlending}
          toneMapped={true}
        />
      </mesh>

      <mesh scale={1.035} renderOrder={3}>
        <sphereGeometry args={[2, 96, 96]} />
        <shaderMaterial
          ref={atmosphereMaterialRef}
          vertexShader={atmosphereVertexShader}
          fragmentShader={atmosphereFragmentShader}
          uniforms={{ sunDirectionView: { value: sunDirectionView } }}
          transparent
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
          depthTest={true}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}