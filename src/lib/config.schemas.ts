import { z } from "zod";
import { CURRENCIES, DATE_FORMATS } from "@/lib/config";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

/** Machine keys stay lowercase, hyphen/underscore only — they end up in URLs and RLS. */
export const codeSchema = trimmed(2, 40)
  .regex(/^[a-z0-9][a-z0-9-_]*$/, "Use lowercase letters, numbers and hyphens.");

/** Subject/school codes are shown to humans in uppercase. */
export const upperCodeSchema = trimmed(2, 20)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "Use letters, numbers and hyphens.")
  .transform((v) => v.toUpperCase());

const hexColor = trimmed(4, 9).regex(/^#([0-9a-fA-F]{6})$/, "Use a 6-digit hex colour, e.g. #2f6f8f.");
const currency = trimmed(3, 3)
  .transform((v) => v.toUpperCase())
  .refine((v) => CURRENCIES.includes(v) || /^[A-Z]{3}$/.test(v), "Use a 3-letter ISO currency code.");
const locale = trimmed(2, 12).regex(/^[a-z]{2}(-[A-Za-z0-9]{2,8})*$/, "Use a locale like en-GH.");
const timezone = trimmed(1, 60).regex(/^[A-Za-z_]+(\/[A-Za-z_+\-0-9]+)*$/, "Use an IANA timezone, e.g. Africa/Accra.");

export const idSchema = z.object({ id: z.string().uuid() });

export const schoolTypeSchema = z.object({
  code: codeSchema,
  name: trimmed(2, 120),
  description: z.string().trim().max(400).default(""),
  active: z.boolean().default(true),
});

export const educationLevelSchema = z
  .object({
    code: codeSchema,
    name: trimmed(2, 120),
    sortOrder: z.number().int().min(1).max(99),
    minAge: z.number().int().min(0).max(99).nullable().optional(),
    maxAge: z.number().int().min(0).max(99).nullable().optional(),
    active: z.boolean().default(true),
  })
  .refine(
    (v) => v.minAge == null || v.maxAge == null || v.maxAge >= v.minAge,
    { message: "Maximum age must be at or above the minimum age.", path: ["maxAge"] },
  );

export const schoolSchema = z.object({
  name: trimmed(2, 160),
  code: upperCodeSchema,
  country: trimmed(2, 80),
  region: z.string().trim().max(80).default(""),
  district: z.string().trim().max(120).default(""),
  town: z.string().trim().max(120).default(""),
  community: z.string().trim().max(120).default(""),
  postalAddress: z.string().trim().max(200).default(""),
  gpsAddress: z
    .string()
    .trim()
    .max(30)
    .default("")
    .refine(
      (v) => v === "" || /^[A-Za-z]{2}-\d{3,4}-\d{3,4}$/.test(v),
      "Use a Ghana Post GPS address like GA-123-4567.",
    ),
  timezone: timezone.default("UTC"),
  currency,
  locale,
  typeCode: codeSchema,
  levelCodes: z.array(codeSchema).min(1, "Select at least one education level.").max(20),
  active: z.boolean().default(true),
});

export const updateSchoolSchema = schoolSchema.partial().extend({ id: z.string().uuid() });

export const subjectSchema = z.object({
  schoolId: z.string().uuid(),
  levelCode: codeSchema,
  code: upperCodeSchema,
  name: trimmed(2, 160),
  credits: z.number().min(0).max(100).nullable().optional(),
  elective: z.boolean().default(false),
  active: z.boolean().default(true),
});

/* ------------------------------ classes ------------------------------ */

export const schoolClassSchema = z.object({
  schoolId: z.string().uuid(),
  levelCode: codeSchema,
  name: trimmed(1, 80),
  sortOrder: z.number().int().min(1).max(999).default(1),
  active: z.boolean().default(true),
});

export const updateSchoolClassSchema = z.object({
  id: z.string().uuid(),
  levelCode: codeSchema.optional(),
  name: trimmed(1, 80).optional(),
  sortOrder: z.number().int().min(1).max(999).optional(),
  active: z.boolean().optional(),
});

export type SchoolClassInput = z.infer<typeof schoolClassSchema>;

export const tenantSettingsSchema = z.object({
  schoolId: z.string().uuid(),
  /* Positions, departments and schedule types belong to People Configuration;
     grading and year start belong to Academic Configuration. Not accepted here. */
  weekStartsOn: z.enum(["monday", "sunday"]),
  features: z.record(z.string().min(1).max(60), z.boolean()),
});

export const brandingSchema = z.object({
  schoolId: z.string().uuid(),
  displayName: z.string().trim().max(160).default(""),
  tagline: z.string().trim().max(200).default(""),
  motto: z.string().trim().max(200).default(""),
  establishedYear: z.string().trim().regex(/^(\d{4})?$/, "Use a 4-digit year.").default(""),
  /** An uploaded image, stored as a resized data URL (see image-resize.ts). */
  logoUrl: z
    .string()
    .trim()
    .max(600_000, "The logo image is too large.")
    .regex(/^(data:image\/(png|jpeg|webp|svg\+xml|gif);base64,|https:\/\/)/, "Upload an image file.")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  primaryColor: hexColor,
  accentColor: hexColor,
  language: trimmed(2, 8),
  locale,
  dateFormat: z.enum(DATE_FORMATS),
  showPoweredBy: z.boolean().default(true),
});

/* --------------------------- numbering --------------------------- */

const numberFormat = trimmed(3, 60).regex(
  /^[A-Z0-9\-/{}A-Za-z]*\{SEQ\}[A-Z0-9\-/{}A-Za-z]*$/,
  "The template must include {SEQ}; you can also use {SCHOOL} and {YY}.",
);

const seqFits = (prefix: "admission" | "employee") => (v: Record<string, unknown>) =>
  (v[`${prefix}SequenceStart`] as number) < 10 ** (v[`${prefix}SequenceDigits`] as number);
const seqMsg = { message: "The starting number does not fit in the sequence length." };

/** Admission numbering — owned by Operations Configuration. */
export const admissionNumberingSchema = z
  .object({
    schoolId: z.string().uuid(),
    admissionFormat: numberFormat.default("{SCHOOL}{YY}{SEQ}"),
    admissionTotalDigits: z.number().int().min(6).max(20),
    admissionYearDigits: z.number().int().min(0).max(4),
    admissionSequenceDigits: z.number().int().min(1).max(8),
    admissionSequenceStart: z.number().int().min(0).max(99999999),
  })
  .refine(seqFits("admission"), { ...seqMsg, path: ["admissionSequenceStart"] });

/** School code + employee numbering — owned by System & Platform Configuration. */
export const employeeNumberingSchema = z
  .object({
    schoolId: z.string().uuid(),
    schoolCode: trimmed(4, 4).regex(/^[0-9]{4}$/, "The school code must be exactly 4 digits."),
    employeeFormat: numberFormat.default("{SCHOOL}{YY}{SEQ}"),
    employeeTotalDigits: z.number().int().min(5).max(20),
    employeeYearDigits: z.number().int().min(0).max(4),
    employeeSequenceDigits: z.number().int().min(1).max(8),
    employeeSequenceStart: z.number().int().min(0).max(99999999),
    employeeAllocationMode: z.enum(["compact", "random"]),
  })
  .refine(seqFits("employee"), { ...seqMsg, path: ["employeeSequenceStart"] });

export type AdmissionNumberingInput = z.infer<typeof admissionNumberingSchema>;
export type EmployeeNumberingInput = z.infer<typeof employeeNumberingSchema>;

export type SchoolInput = z.infer<typeof schoolSchema>;
export type SubjectInput = z.infer<typeof subjectSchema>;
export type TenantSettingsInput = z.infer<typeof tenantSettingsSchema>;
export type BrandingInput = z.infer<typeof brandingSchema>;
