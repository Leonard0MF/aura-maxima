"use client";
import { SUN_DIRECTION } from "../world/Earth";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import Earth from "../world/Earth";

export default function Scene() {
  return (
    <>
      <color attach="background" args={["#000000"]} />

      <ambientLight intensity={0.04} />
<directionalLight
  position={SUN_DIRECTION.toArray()}
  intensity={3.4}
  color="#fff6e8"
/>
<directionalLight position={[4, -3, -5]} intensity={0.04} color="#4477ff" />
      <Earth />

      <Stars />
    </>
  );
}

function Stars() {
  const positions = new Float32Array(
    2500 * 3
  );

  for (let i = 0; i < 2500; i++) {
    const radius = 35;

    const theta =
      Math.random() * Math.PI * 2;

    const phi =
      Math.acos(
        2 * Math.random() - 1
      );

    positions[i * 3] =
      radius *
      Math.sin(phi) *
      Math.cos(theta);

    positions[i * 3 + 1] =
      radius *
      Math.cos(phi);

    positions[i * 3 + 2] =
      radius *
      Math.sin(phi) *
      Math.sin(theta);
  }

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[
            positions,
            3,
            false,
          ]}
        />
      </bufferGeometry>

      <pointsMaterial
        size={0.018}
        transparent
        opacity={0.65}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}