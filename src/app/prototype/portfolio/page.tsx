"use client";

// PROTOTYPE (#71), throwaway: three variants of the portfolio dashboard on one route,
// switchable via `?variant=A|B|C|D|E` and the floating bar. Made-up data, no persistence.

import { Suspense, use } from "react";
import { PrototypeSwitcher } from "@/ui/PrototypeSwitcher";
import { VariantA, VariantB, VariantC, VariantD, VariantE } from "./variants";
import "./prototype.css";

const VARIANTS = [
  { key: "A", name: "Tabela única" },
  { key: "B", name: "Classes e detalhe" },
  { key: "C", name: "Alvo primeiro" },
  { key: "D", name: "B + A + C · entrar no ativo" },
  { key: "E", name: "B + A + C · expandir a linha" },
];

export default function Page({ searchParams }: { searchParams: Promise<{ variant?: string }> }) {
  const variant = use(searchParams).variant ?? "A";
  return (
    <>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      {variant === "D" && <VariantD />}
      {variant === "E" && <VariantE />}
      <Suspense>
        <PrototypeSwitcher variants={VARIANTS} />
      </Suspense>
    </>
  );
}
