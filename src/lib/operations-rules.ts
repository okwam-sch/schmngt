/* ------------------------------------------------------------------ *
 * Operations rules: the single place for admissions process, library
 * policies and messaging channels. Stored in tenant_settings.features
 * under OPS_FEATURE_KEY with a version for safe concurrent edits. Every
 * rule and list item ships with a default and may be deleted.
 * Admission numbering lives in numbering_settings and is edited on the
 * same Operations page. Browser-safe.
 * ------------------------------------------------------------------ */
import { z } from "zod";

export const OPS_FEATURE_KEY = "__operations_rules";

export const OPS_SECTIONS = ["admissions", "library", "messaging"] as const;
export type OpsSection = (typeof OPS_SECTIONS)[number];

export const OPS_SECTION_LABEL: Record<OpsSection, { title: string; summary: string; modules: string[] }> = {
  admissions: { title: "Admissions process", summary: "Application steps, documents and numbering.", modules: ["admissions"] },
  library: { title: "Library policies", summary: "Loan periods, limits and fines.", modules: ["library"] },
  messaging: { title: "Messaging channels", summary: "Announcement audiences and channels.", modules: ["messaging", "dashboard"] },
};

const ruleSchema = z.object({
  key: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  value: z.union([z.number().min(0).max(100000), z.string().max(200), z.boolean()]),
  unit: z.string().max(20).optional(),
});
export type OpsRule = z.infer<typeof ruleSchema>;

const list = z.array(z.string().trim().min(1).max(80)).max(60);
const unique = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase())).size === xs.length;

export const OPS_LISTS = ["requiredDocuments", "genders", "messagingChannels", "audiences"] as const;
export type OpsList = (typeof OPS_LISTS)[number];

export const opsRulesSchema = z
  .object({
    version: z.number().int().min(0).default(0),
    requiredDocuments: list,
    genders: list,
    messagingChannels: list,
    audiences: list,
    admissions: z.array(ruleSchema).max(30),
    library: z.array(ruleSchema).max(30),
    messaging: z.array(ruleSchema).max(30),
  })
  .refine((r) => OPS_LISTS.every((k) => unique(r[k])), { message: "List items must be unique" })
  .refine((r) => OPS_SECTIONS.every((s) => new Set(r[s].map((x) => x.key)).size === r[s].length), {
    message: "Two rules in one section share the same key",
  });
export type OpsRules = z.infer<typeof opsRulesSchema>;

export const DEFAULT_OPS_LISTS: Record<OpsList, string[]> = {
  requiredDocuments: ["Birth certificate", "Passport photo", "Previous school report"],
  genders: ["Male", "Female", "Other"],
  messagingChannels: ["In-app", "Email", "SMS"],
  audiences: ["Everyone", "Staff", "Parents", "Students"],
};

export const DEFAULT_OPS_RULES: Record<OpsSection, OpsRule[]> = {
  admissions: [
    { key: "min-age", label: "Minimum age at admission", value: 2, unit: "years" },
    { key: "require-documents", label: "Require all listed documents", value: false },
    { key: "parent-email-required", label: "Require a parent email", value: true },
  ],
  library: [
    { key: "loan-days", label: "Loan period", value: 14, unit: "days" },
    { key: "max-loans", label: "Books per borrower", value: 3 },
    { key: "renewals", label: "Renewals allowed", value: 1 },
    { key: "fine-per-day", label: "Late fine per day", value: 1, unit: "currency" },
  ],
  messaging: [
    { key: "direct-messages", label: "Allow direct messages", value: true },
    { key: "max-length", label: "Maximum message length", value: 2000, unit: "chars" },
    { key: "announcement-days", label: "Announcements stay visible for", value: 30, unit: "days" },
  ],
};

export function defaultOpsRules(): OpsRules {
  return {
    version: 0,
    requiredDocuments: [...DEFAULT_OPS_LISTS.requiredDocuments],
    genders: [...DEFAULT_OPS_LISTS.genders],
    messagingChannels: [...DEFAULT_OPS_LISTS.messagingChannels],
    audiences: [...DEFAULT_OPS_LISTS.audiences],
    admissions: DEFAULT_OPS_RULES.admissions.map((r) => ({ ...r })),
    library: DEFAULT_OPS_RULES.library.map((r) => ({ ...r })),
    messaging: DEFAULT_OPS_RULES.messaging.map((r) => ({ ...r })),
  };
}

/** Stored rules, or the defaults when none are saved / the data is malformed. */
export function parseOpsRules(raw: unknown): OpsRules {
  const r = opsRulesSchema.safeParse(raw);
  return r.success ? r.data : defaultOpsRules();
}

/** Rule value, or null when the rule was deleted (deleted = not applied). */
export function opsValue(r: OpsRules, section: OpsSection, key: string) {
  return r[section].find((x) => x.key === key)?.value ?? null;
}

/** A configured list, falling back to the defaults when emptied. */
export function opsList(r: OpsRules, key: OpsList) {
  return r[key].length ? r[key] : DEFAULT_OPS_LISTS[key];
}

export function missingOpsDefaults(r: OpsRules, section: OpsSection) {
  return DEFAULT_OPS_RULES[section].filter((d) => !r[section].some((x) => x.key === d.key));
}
