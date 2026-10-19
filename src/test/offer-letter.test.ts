import { describe, expect, it } from "vitest";
import { acceptanceDeadline, eligibleForOffer, hasContractRenewal, NOTICE_MONTHS, offerReference } from "@/lib/offer-letter";

describe("Appointment letter rules", () => {
  it("requires written acceptance ten days after onboarding, including across months", () => {
    expect(acceptanceDeadline("2026-01-25T23:30:00Z")).toBe("04-02-2026");
  });
  it("uses one month for termination and resignation notice", () => {
    expect(NOTICE_MONTHS).toBe(1);
  });
  it("includes renewal only for contract appointments", () => {
    expect(hasContractRenewal("Contract")).toBe(true);
    expect(hasContractRenewal("Permanent")).toBe(false);
    expect(hasContractRenewal("Temporary")).toBe(false);
  });
  it("offers appointment letters to staff and school managers, not other roles", () => {
    expect(eligibleForOffer("staff")).toBe(true);
    expect(eligibleForOffer("school_manager")).toBe(true);
    expect(eligibleForOffer("student")).toBe(false);
    expect(eligibleForOffer("super_admin")).toBe(false);
  });
  it("generates stable distinct references for accounts and offers", () => {
    const n = { schoolCode: "0042", yearDigits: 2, sequenceDigits: 4 };
    expect(offerReference("account", n, 7, "2026-03-01T00:00:00Z")).toBe("APPT/EMP/0042/26/0007");
    expect(offerReference("offer", n, 12, "2026-03-01T00:00:00Z")).toBe("APPT/OFR/0042/26/0012");
  });
});