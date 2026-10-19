import { describe, it, expect } from "vitest";
import { CONFIG_DOMAINS, governedModuleIds } from "@/lib/config-domains";
import { getModule } from "@/lib/access";

describe("configuration domains", () => {
  it("has six domains, each a registered module", () => {
    expect(CONFIG_DOMAINS).toHaveLength(6);
    for (const d of CONFIG_DOMAINS) expect(getModule(d.id)).toBeDefined();
  });
  it("every operational module is governed by exactly one domain", () => {
    for (const id of governedModuleIds()) {
      const owners = CONFIG_DOMAINS.filter((d) => d.governs !== "*" && d.governs.includes(id));
      expect(owners.map((o) => o.id), id).toHaveLength(1);
    }
  });
});
