"use client";

import { useEffect } from "react";

import { showDiag } from "@/lib/diag";

/* ?debug: abre o painel de diagnóstico com os dados do aparelho (lib/diag) */
export function DiagMount() {
  useEffect(() => {
    showDiag();
  }, []);
  return null;
}
