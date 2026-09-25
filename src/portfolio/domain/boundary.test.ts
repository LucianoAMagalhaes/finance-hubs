import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The two contexts have no relation (CONTEXT-MAP.md): the portfolio's domain
// takes generic pieces from `@/shared`, and nothing from the budget's.

const HERE = path.dirname(new URL(import.meta.url).pathname);

describe("the portfolio's domain", () => {
  it("imports nothing from the budget's domain", () => {
    const imports = readdirSync(HERE, { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".ts"))
      .flatMap((name) =>
        [...readFileSync(path.join(HERE, name), "utf8").matchAll(/from\s+"([^"]+)"/g)].map((m) => `${name}: ${m[1]}`),
      );

    expect(imports.filter((i) => /"?(@\/domain|\.\.\/\.\.\/domain)(\/|$)/.test(i.split(": ")[1]!))).toEqual([]);
    expect(imports.some((i) => i.endsWith("@/shared"))).toBe(true);
  });
});
