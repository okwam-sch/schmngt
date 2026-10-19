/* ------------------------------------------------------------------ *
 * People rules: the single place for staff lifecycle (incl. appointment
 * letter terms), student lifecycle, guardian relationships and identity &
 * access rules. Stored in tenant_settings.features under
 * PEOPLE_FEATURE_KEY with a version for safe concurrent edits. Every rule
 * and list item ships with a default and may be deleted.
 * Browser-safe; read by People Configuration, the modules and servers.
 * ------------------------------------------------------------------ */
import { z } from "zod";

export const PEOPLE_FEATURE_KEY = "__people_rules";

export const PEOPLE_SECTIONS = ["staffLifecycle", "studentLifecycle", "guardian", "identity"] as const;
export type PeopleSection = (typeof PEOPLE_SECTIONS)[number];

export const PEOPLE_SECTION_LABEL: Record<PeopleSection, { title: string; summary: string; modules: string[] }> = {
  staffLifecycle: { title: "Staff lifecycle", summary: "Onboarding and appointment letter terms.", modules: ["staff-management", "user-management"] },
  studentLifecycle: { title: "Student lifecycle", summary: "Promotion, transfer and withdrawal rules.", modules: ["students"] },
  guardian: { title: "Guardian relationships", summary: "How guardians link to and are contacted about students.", modules: ["parent-communication", "my-children"] },
  identity: { title: "Identity & access", summary: "Verification checks and default access for new accounts.", modules: ["user-verification", "user-management"] },
};

const ruleSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  value: z.union([z.number().min(0).max(100000), z.string().max(200), z.boolean()]),
  unit: z.string().max(20).optional(),
});
export type PeopleRule = z.infer<typeof ruleSchema>;

const list = z.array(z.string().trim().min(1).max(80)).max(60);

export const peopleRulesSchema = z
  .object({
    version: z.number().int().min(0).default(0),
    employmentTypes: list,
    guardianRelationships: list,
    staffLifecycle: z.array(ruleSchema).max(30),
    studentLifecycle: z.array(ruleSchema).max(30),
    guardian: z.array(ruleSchema).max(30),
    identity: z.array(ruleSchema).max(30),
  })
  .refine((r) => new Set(r.employmentTypes.map((t) => t.toLowerCase())).size === r.employmentTypes.length, {
    message: "Employment types must be unique",
  })
  .refine((r) => new Set(r.guardianRelationships.map((t) => t.toLowerCase())).size === r.guardianRelationships.length, {
    message: "Guardian relationships must be unique",
  })
  .refine((r) => PEOPLE_SECTIONS.every((s) => new Set(r[s].map((x) => x.key)).size === r[s].length), {
    message: "Two rules in one section share the same key",
  });
export type PeopleRules = z.infer<typeof peopleRulesSchema>;

export const DEFAULT_EMPLOYMENT_TYPES = ["Permanent", "Contract", "Temporary", "Part-time"];
export const DEFAULT_GUARDIAN_RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Sibling", "Other relative"];

export const DEFAULT_PEOPLE_RULES: Record<PeopleSection, PeopleRule[]> = {
  staffLifecycle: [
    { key: "notice-months", label: "Notice period", value: 1, unit: "months" },
    { key: "acceptance-days", label: "Days to accept an appointment letter", value: 10, unit: "days" },
    { key: "probation-months", label: "Probation period", value: 6, unit: "months" },
  ],
  studentLifecycle: [
    { key: "promotion-average", label: "Minimum average for promotion", value: 50, unit: "%" },
    { key: "transfer-letter", label: "Require a transfer letter", value: true },
    { key: "withdrawal-clearance", label: "Require fee clearance before withdrawal", value: true },
  ],
  guardian: [
    { key: "max-guardians", label: "Guardians per student", value: 3 },
    { key: "primary-required", label: "Require a primary contact", value: true },
  ],
  identity: [
    { key: "require-photo", label: "Require a photo before verification", value: true },
    { key: "require-id-number", label: "Require an ID number before verification", value: true },
    { key: "default-access", label: "Default access level for new accounts", value: "basic" },
  ],
};

export function defaultPeopleRules(): PeopleRules {
  return {
    version: 0,
    employmentTypes: [...DEFAULT_EMPLOYMENT_TYPES],
    guardianRelationships: [...DEFAULT_GUARDIAN_RELATIONSHIPS],
    staffLifecycle: DEFAULT_PEOPLE_RULES.staffLifecycle.map((r) => ({ ...r })),
    studentLifecycle: DEFAULT_PEOPLE_RULES.studentLifecycle.map((r) => ({ ...r })),
    guardian: DEFAULT_PEOPLE_RULES.guardian.map((r) => ({ ...r })),
    identity: DEFAULT_PEOPLE_RULES.identity.map((r) => ({ ...r })),
  };
}

/** Stored rules, or the defaults when none are saved / the data is malformed. */
export function parsePeopleRules(raw: unknown): PeopleRules {
  const r = peopleRulesSchema.safeParse(raw);
  return r.success ? r.data : defaultPeopleRules();
}

/** Numeric rule value, or null when the rule was deleted. */
export function peopleNum(r: PeopleRules, section: PeopleSection, key: string): number | null {
  const v = r[section].find((x) => x.key === key)?.value;
  return typeof v === "number" ? v : null;
}

/** Appointment-letter terms; a deleted rule falls back to the default term. */
export function letterTerms(r: PeopleRules) {
  return {
    noticeMonths: peopleNum(r, "staffLifecycle", "notice-months") ?? 1,
    acceptanceDays: peopleNum(r, "staffLifecycle", "acceptance-days") ?? 10,
    employmentTypes: r.employmentTypes.length ? r.employmentTypes : DEFAULT_EMPLOYMENT_TYPES,
  };
}

export function missingPeopleDefaults(r: PeopleRules, section: PeopleSection) {
  return DEFAULT_PEOPLE_RULES[section].filter((d) => !r[section].some((x) => x.key === d.key));
}
