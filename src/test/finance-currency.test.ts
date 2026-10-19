import { describe, it, expect } from "vitest";
import { brandingSchema } from "@/lib/config.schemas";
import { CONFIG_DOMAINS } from "@/lib/config-domains";

describe("currency ownership", () => {
  it("branding no longer carries a currency", () => {
    expect(Object.keys(brandingSchema.shape)).not.toContain("currency");
  });
  it("financial configuration governs every finance module", () => {
    const fin = CONFIG_DOMAINS.find((d) => d.id === "financial-configuration")!;
    expect(fin.governs).toEqual(expect.arrayContaining(["fees-invoicing", "invoices", "financial-management"]));
  });
});
