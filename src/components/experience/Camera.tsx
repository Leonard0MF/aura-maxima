"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

export default function Camera() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0, 7);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return null;
}