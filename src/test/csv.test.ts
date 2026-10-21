import { describe, expect, it } from "vitest";
import { csvCell, recordsToCsv, toCsv } from "@/lib/csv";

describe("central CSV helpers", () => {
  it("quotes every cell and escapes embedded quotes", () => {
    expect(toCsv([["a", 'he said "hi"'], [1, null]])).toBe(
      '\uFEFF"a","he said ""hi"""\r\n"1",""',
    );
  });

  it("neutralizes formula-like values", () => {
    for (const v of ["=SUM(A1)", "+1", "@x", "-2", "\t=1"]) {
      expect(csvCell(v).startsWith(`"'`)).toBe(true);
    }
    expect(csvCell("Ama")).toBe('"Ama"');
  });

  it("builds record CSV with headers from the first record", () => {
    expect(recordsToCsv([{ name: "Ama", score: 9 }, { name: "Kofi", score: 7 }])).toBe(
      '\uFEFF"name","score"\r\n"Ama","9"\r\n"Kofi","7"',
    );
    expect(recordsToCsv([])).toBe("");
  });
});
