import { describe, it, expect } from "vitest";
import { defaultPeopleRules, letterTerms, parsePeopleRules, peopleRulesSchema } from "@/lib/people-rules";
import { acceptanceDeadline } from "@/lib/offer-letter";

describe("people rules", () => {
  it("defaults give 1 month notice and 10 days to accept", () => {
    expect(letterTerms(defaultPeopleRules())).toMatchObject({ noticeMonths: 1, acceptanceDays: 10 });
  });
  it("configured acceptance days change the letter deadline", () => {
    const r = defaultPeopleRules();
    r.staffLifecycle = r.staffLifecycle.map((x) => (x.key === "acceptance-days" ? { ...x, value: 14 } : x));
    expect(acceptanceDeadline("2026-01-01", letterTerms(r).acceptanceDays)).toBe("15-01-2026");
  });
  it("deleting the notice rule falls back to 1 month", () => {
    const r = defaultPeopleRules();
    r.staffLifecycle = r.staffLifecycle.filter((x) => x.key !== "notice-months");
    expect(letterTerms(r).noticeMonths).toBe(1);
  });
  it("rejects duplicate employment types", () => {
    const r = { ...defaultPeopleRules(), employmentTypes: ["Contract", "contract"] };
    expect(peopleRulesSchema.safeParse(r).success).toBe(false);
  });
  it("malformed stored data falls back to defaults", () => {
    expect(parsePeopleRules({ junk: true }).version).toBe(0);
  });
});
