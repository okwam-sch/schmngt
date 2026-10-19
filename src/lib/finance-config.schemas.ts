import { z } from "zod";
import { CONFIG_STATUSES, LIST_KEYS, RULE_KEYS, SETTINGS_KEYS } from "@/lib/finance-config";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalDate = z
  .string()
  .trim()
  .max(20)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const sectionKey = z.string().trim().min(2).max(60);
const jsonObject = z.record(z.string().min(1).max(80), z.unknown());

export const schoolScope = z.object({ schoolId: z.string().uuid() });

export const saveSectionSchema = z.object({
  schoolId: z.string().uuid(),
  sectionKey: sectionKey.refine((k) => SETTINGS_KEYS.includes(k), "Unknown settings section."),
  payload: jsonObject,
  notes: z.string().trim().max(1000).default(""),
  effectiveFrom: optionalDate,
  /** Keep editing the current draft, or start a new version from it. */
  newVersion: z.boolean().default(false),
});

export const sectionStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CONFIG_STATUSES),
});

export const referenceItemSchema = z.object({
  id: z.string().uuid().optional(),
  schoolId: z.string().uuid(),
  listKey: sectionKey.refine((k) => LIST_KEYS.includes(k), "Unknown list."),
  code: text(1, 60).regex(/^[A-Za-z0-9][A-Za-z0-9-_.]*$/, "Use letters, numbers, hyphens or dots."),
  name: text(1, 160),
  description: z.string().trim().max(400).default(""),
  parentCode: z.string().trim().max(60).nullable().optional(),
  sortOrder: z.number().int().min(1).max(999).default(1),
  active: z.boolean().default(true),
  metadata: jsonObject.default({}),
});

export const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  schoolId: z.string().uuid(),
  ruleKey: sectionKey.refine((k) => RULE_KEYS.includes(k), "Unknown rule set."),
  name: text(2, 160),
  description: z.string().trim().max(600).default(""),
  priority: z.number().int().min(1).max(999).default(1),
  conditions: jsonObject.default({}),
  actions: jsonObject.default({}),
  effectiveFrom: optionalDate,
  effectiveTo: optionalDate,
  active: z.boolean().default(true),
});

export const deleteSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["item", "rule", "section"]),
});

export type ReferenceItemInput = z.infer<typeof referenceItemSchema>;
export type RuleInput = z.infer<typeof ruleSchema>;
export type SaveSectionInput = z.infer<typeof saveSectionSchema>;
