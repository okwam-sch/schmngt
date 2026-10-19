import { describe, expect, it } from "vitest";
import { generateStrongPassword, isStrongPassword, passwordError, passwordSchema } from "@/lib/password-policy";

describe("password policy", () => {
  it("rejects each missing requirement", () => {
    for (const p of ["Ab1!xyz", "abcdef1!", "ABCDEF1!", "Abcdefg!", "Abcdefg1"]) {
      expect(isStrongPassword(p)).toBe(false);
      expect(passwordSchema.safeParse(p).success).toBe(false);
    }
  });
  it("accepts a compliant password", () => {
    expect(passwordError("Abcdef1!")).toBeNull();
  });
  it("generator always complies", () => {
    for (let i = 0; i < 200; i++) expect(isStrongPassword(generateStrongPassword(8))).toBe(true);
  });
});
