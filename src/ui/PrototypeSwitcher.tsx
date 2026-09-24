"use client";

// PROTOTYPE, throwaway: the floating bar that cycles a prototype route's `?variant=`.

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function PrototypeSwitcher({ variants }: { variants: { key: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = Math.max(
    0,
    variants.findIndex((v) => v.key === (params.get("variant") ?? variants[0]!.key)),
  );

  const go = (step: number) => {
    const next = variants[(current + step + variants.length) % variants.length]!;
    const search = new URLSearchParams(params);
    search.set("variant", next.key);
    router.replace(`${pathname}?${search}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  const v = variants[current]!;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        borderRadius: 999,
        background: "#ff2d8a",
        color: "#fff",
        fontWeight: 600,
        boxShadow: "0 6px 24px rgba(0,0,0,.35)",
      }}
    >
      <button type="button" onClick={() => go(-1)} aria-label="Variante anterior" style={arrow}>
        ←
      </button>
      <span>
        {v.key} ({v.name})
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Próxima variante" style={arrow}>
        →
      </button>
    </div>
  );
}

const arrow = { background: "none", border: 0, color: "inherit", font: "inherit", fontSize: 18, cursor: "pointer" };
