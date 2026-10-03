import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decimal } from "@/portfolio/domain";
import { SourceError, treasuryBonds } from "@/portfolio/sources";

const recorded = readFileSync(new URL("./fixtures/treasury-prices.csv", import.meta.url), "utf8");
const fetchAnswer = (body: string, status = 200): typeof fetch => async () => new Response(body, { status });

describe("the Treasury Transparente CSV adapter", () => {
  it("translates the latest base date's selling prices and leaves historical and expired bonds out of that list", async () => {
    expect(await treasuryBonds(fetchAnswer(recorded))).toEqual([
      { name: "Tesouro Selic 2031", maturityDate: "2031-03-01", sourceId: "selic|2031-03-01", price: decimal(19924.17) },
      { name: "Tesouro IPCA+ 2035", maturityDate: "2035-05-15", sourceId: "ipca-plus|2035-05-15", price: decimal(2523.14) },
    ]);
  });

  it("uses the newest base date regardless of row order and accepts BOM and CRLF", async () => {
    const [header, ...rows] = recorded.trim().split("\n");
    const reversed = `\uFEFF${[header, ...rows.reverse()].join("\r\n")}\r\n`;
    expect(await treasuryBonds(fetchAnswer(reversed))).toEqual([
      { name: "Tesouro IPCA+ 2035", maturityDate: "2035-05-15", sourceId: "ipca-plus|2035-05-15", price: decimal(2523.14) },
      { name: "Tesouro Selic 2031", maturityDate: "2031-03-01", sourceId: "selic|2031-03-01", price: decimal(19924.17) },
    ]);
  });

  it("rejects failed requests, missing columns, invalid dates and invalid current selling prices", async () => {
    await expect(treasuryBonds(fetchAnswer("down", 503))).rejects.toThrow(SourceError);
    await expect(treasuryBonds(async () => { throw new Error("offline"); })).rejects.toThrow(SourceError);
    for (const body of ["", "<html>down</html>", recorded.split("\n")[0]!,
      recorded.replace("PU Venda Manha", "PU Venda"), recorded.replace("02/10/2026", "31/02/2026"),
      recorded.replace("19924,17", "0,00"), recorded.replace("19924,17", "invalid"),
      recorded.replace("19924,17", "19924,123456789"), recorded.replace("Tesouro Selic", "Unknown bond")]) {
      await expect(treasuryBonds(fetchAnswer(body))).rejects.toThrow(SourceError);
    }
  });
});
