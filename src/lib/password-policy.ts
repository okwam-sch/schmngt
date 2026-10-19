import { z } from "zod";

/** Single source of truth for the password policy (client + server). */
export const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { id: "upper", label: "An uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "A lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "number", label: "A number", test: (p: string) => /[0-9]/.test(p) },
  { id: "special", label: "A special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function checkPassword(p: string) {
  return PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, met: r.test(p) }));
}

export function passwordIssues(p: string): string[] {
  return checkPassword(p)
    .filter((r) => !r.met)
    .map((r) => r.label.toLowerCase());
}

export function isStrongPassword(p: string) {
  return passwordIssues(p).length === 0;
}

/** Returns an error message, or null when the password meets the policy. */
export function passwordError(p: string): string | null {
  const issues = passwordIssues(p);
  return issues.length ? `Password needs ${issues.join(", ")}.` : null;
}

export type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string };

export function passwordStrength(p: string): Strength {
  if (!p) return { score: 0, label: "" };
  const met = checkPassword(p).filter((r) => r.met).length;
  let score = met <= 2 ? 1 : met <= 4 ? 2 : 3;
  if (met === 5 && p.length >= 12) score = 4;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score: score as Strength["score"], label: labels[score]! };
}

export const passwordSchema = z
  .string()
  .max(200)
  .superRefine((p, ctx) => {
    const err = passwordError(p);
    if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
  });

/** Random password guaranteed to satisfy every rule. */
export function generateStrongPassword(length = 14) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%^&*"];
  const all = sets.join("");
  const rand = (n: number) => {
    const v = new Uint32Array(1);
    crypto.getRandomValues(v);
    return v[0]! % n;
  };
  const chars = sets.map((s) => s[rand(s.length)]!);
  while (chars.length < Math.max(length, 8)) chars.push(all[rand(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
