import { describe, expect, it } from "vitest";
import { FINANCE_AREAS, areasOwnedBy } from "@/lib/finance-config";
import { getConfigDomain } from "@/lib/config-domains";

describe("reporting & records configuration", () => {
  it("owns reporting, archive/retention and data access areas", () => {
    const keys = areasOwnedBy("reporting-configuration").map((a) => a.key);
    expect(keys).toEqual(["reporting", "archive", "data-access"]);
    expect(areasOwnedBy("financial-configuration").map((a) => a.key)).not.toEqual(expect.arrayContaining(keys));
  });
  it("every area has exactly one owner page", () => {
    const total = areasOwnedBy("financial-configuration").length + areasOwnedBy("reporting-configuration").length;
    expect(total).toBe(FINANCE_AREAS.length);
  });
  it("retention policies live in Reporting & Records", () => {
    const area = areasOwnedBy("reporting-configuration").find((a) => a.sections.some((s) => s.key === "retention-policies"));
    expect(area).toBeTruthy();
    expect(getConfigDomain("reporting-configuration")?.status).toBe("live");
  });
});
