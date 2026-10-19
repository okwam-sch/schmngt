import { createServerFn } from "@tanstack/react-start";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSuperAdmin, logAudit } from "@/lib/admin.server";
import {
  brandingSchema,
  educationLevelSchema,
  idSchema,
  admissionNumberingSchema,
  employeeNumberingSchema,
  schoolClassSchema,
  schoolSchema,
  schoolTypeSchema,
  subjectSchema,
  tenantSettingsSchema,
  updateSchoolClassSchema,
  updateSchoolSchema,
} from "@/lib/config.schemas";
import {
  DEFAULT_DEPARTMENTS,
  DEFAULT_POSITIONS,
  DEFAULT_RATING_SCALE,
  DEFAULT_SCHEDULE_TYPES,
  defaultModuleFeatures,
  mergedFeatures,
} from "@/lib/config";
import { mergePositions } from "@/lib/teaching";
import { z } from "zod";
import { CALENDAR_FEATURE_KEY, calendarSchema, parseCalendar } from "@/lib/academic-calendar";
import { RULES_FEATURE_KEY, parseRules, rulesSchema } from "@/lib/academic-rules";
import { GRADING_SYSTEMS } from "@/lib/config";
import { PEOPLE_FEATURE_KEY, parsePeopleRules, peopleRulesSchema } from "@/lib/people-rules";
import { OPS_FEATURE_KEY, opsRulesSchema, parseOpsRules } from "@/lib/operations-rules";
import { schoolCodeDigits } from "@/lib/numbering";

/** Everything the System Configuration module needs, in one round trip. */
export const getConfiguration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const [types, levels, schools, subjects, settings, branding, numbering, classes] = await Promise.all([
      supabase.from("school_types").select("*").order("name"),
      supabase.from("education_levels").select("*").order("sort_order"),
      supabase.from("schools").select("*").order("name"),
      supabase.from("subjects").select("*").order("name"),
      supabase.from("tenant_settings").select("*"),
      supabase.from("school_branding").select("*"),
      supabase.from("numbering_settings").select("*"),
      supabase.from("school_classes").select("*").order("sort_order"),
    ]);

    const failures = Object.entries({ types, levels, schools, subjects, settings, branding, numbering, classes })
      .filter(([, r]) => r.error)
      .map(([name, r]) => `${name}: ${r.error!.message}`);
    if (failures.length) throw new Error(`Could not load configuration (${failures.join("; ")})`);

    return {
      types: types.data ?? [],
      levels: levels.data ?? [],
      schools: schools.data ?? [],
      subjects: subjects.data ?? [],
      settings: (settings.data ?? []).map((s) => ({ ...s, features: mergedFeatures(s.features as never) })),
      branding: branding.data ?? [],
      numbering: numbering.data ?? [],
      classes: classes.data ?? [],
    };
  });

/* ----------------------------- schools ----------------------------- */

export const createSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schoolSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const { data: type } = await supabase
      .from("school_types")
      .select("code")
      .eq("code", data.typeCode)
      .maybeSingle();
    if (!type) throw new Error("Unknown school type.");

    const { data: levels } = await supabase
      .from("education_levels")
      .select("code")
      .in("code", data.levelCodes);
    if ((levels?.length ?? 0) !== data.levelCodes.length) {
      throw new Error("One or more education levels no longer exist.");
    }

    const { data: school, error } = await supabase
      .from("schools")
      .insert({
        name: data.name,
        code: data.code,
        country: data.country,
        region: data.region ?? "",
        district: data.district ?? "",
        town: data.town ?? "",
        community: data.community ?? "",
        postal_address: data.postalAddress ?? "",
        gps_address: data.gpsAddress ?? "",
        timezone: data.timezone ?? "UTC",
        currency: data.currency,
        locale: data.locale,
        type_code: data.typeCode,
        level_codes: data.levelCodes,
        active: data.active ?? true,
      })
      .select("*")
      .single();
    if (error) {
      throw new Error(
        error.code === "23505" ? "A school already uses that short code." : error.message,
      );
    }

    // Provision the tenant's policy + branding rows atomically with the school
    // so no downstream module ever reads a half-configured tenant.
    const [{ error: sErr }, { error: bErr }] = await Promise.all([
      supabase.from("tenant_settings").insert({
        school_id: school.id,
        positions: DEFAULT_POSITIONS,
        departments: DEFAULT_DEPARTMENTS,
        schedule_types: DEFAULT_SCHEDULE_TYPES,
        rating_scale: DEFAULT_RATING_SCALE as unknown as Json,
        features: defaultModuleFeatures(),
      }),
      supabase.from("school_branding").insert({
        school_id: school.id,
        display_name: school.name,
        currency: school.currency,
        locale: school.locale,
      }),
    ]);
    if (sErr ?? bErr) throw new Error((sErr ?? bErr)!.message);

    await logAudit(supabase, context.userId, {
      action: "school_created",
      description: `Provisioned school ${school.name} (${school.code})`,
      details: { schoolId: school.id },
    });
    return school;
  });

export const updateSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchoolSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { id, typeCode, levelCodes, ...rest } = data;
    const { error } = await context.supabase
      .from("schools")
      .update({
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.code !== undefined ? { code: rest.code } : {}),
        ...(rest.country !== undefined ? { country: rest.country } : {}),
        ...(rest.region !== undefined ? { region: rest.region } : {}),
        ...(rest.district !== undefined ? { district: rest.district } : {}),
        ...(rest.town !== undefined ? { town: rest.town } : {}),
        ...(rest.community !== undefined ? { community: rest.community } : {}),
        ...(rest.postalAddress !== undefined ? { postal_address: rest.postalAddress } : {}),
        ...(rest.gpsAddress !== undefined ? { gps_address: rest.gpsAddress } : {}),
        ...(rest.timezone !== undefined ? { timezone: rest.timezone } : {}),
        ...(rest.locale !== undefined ? { locale: rest.locale } : {}),
        ...(rest.active !== undefined ? { active: rest.active } : {}),
        ...(typeCode !== undefined ? { type_code: typeCode } : {}),
        ...(levelCodes !== undefined ? { level_codes: levelCodes } : {}),
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "school_updated",
      description: `Updated school configuration`,
      details: { schoolId: id },
    });
    return { ok: true };
  });

export const deleteSchool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("schools").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "school_deleted",
      description: "Removed a school and its scoped configuration",
      details: { schoolId: data.id },
    });
    return { ok: true };
  });

/* -------------------------- catalogue -------------------------- */

export const createEducationLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => educationLevelSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("education_levels").insert({
      code: data.code,
      name: data.name,
      sort_order: data.sortOrder,
      min_age: data.minAge ?? null,
      max_age: data.maxAge ?? null,
      active: data.active ?? true,
    });
    if (error) {
      throw new Error(error.code === "23505" ? "That level code already exists." : error.message);
    }
    return { ok: true };
  });

export const createSchoolType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schoolTypeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("school_types").insert({
      code: data.code,
      name: data.name,
      description: data.description ?? "",
      active: data.active ?? true,
    });
    if (error) {
      throw new Error(error.code === "23505" ? "That type code already exists." : error.message);
    }
    return { ok: true };
  });

export const createSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => subjectSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const { data: school } = await supabase
      .from("schools")
      .select("id, level_codes")
      .eq("id", data.schoolId)
      .maybeSingle();
    if (!school) throw new Error("Unknown school.");
    if (!(school.level_codes ?? []).includes(data.levelCode)) {
      throw new Error("That education level is not offered by this school.");
    }

    const { error } = await supabase.from("subjects").insert({
      school_id: data.schoolId,
      level_code: data.levelCode,
      code: data.code,
      name: data.name,
      credits: data.credits ?? null,
      elective: data.elective ?? false,
      active: data.active ?? true,
    });
    if (error) {
      throw new Error(
        error.code === "23505" ? "That subject code already exists for this level." : error.message,
      );
    }
    return { ok: true };
  });

export const deleteSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("subjects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------ policy & branding ------------------------ */

export const saveTenantSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => tenantSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    // Fresh read so keys owned by other domains ("__"-prefixed: calendar, academic/people rules) are kept.
    const existing = await readCalendarRow(context.supabase, data.schoolId);
    const kept = Object.fromEntries(
      Object.entries(existing?.features ?? {}).filter(([k]) => k.startsWith("__")),
    );
    const features = { ...mergedFeatures(data.features), ...kept } as unknown as Json;
    // Only write the columns this domain owns; other domains' columns stay untouched.
    const { error } = existing
      ? await context.supabase
          .from("tenant_settings")
          .update({ week_starts_on: data.weekStartsOn, features })
          .eq("school_id", data.schoolId)
      : await context.supabase.from("tenant_settings").insert({
          school_id: data.schoolId,
          positions: [...DEFAULT_POSITIONS],
          departments: [...DEFAULT_DEPARTMENTS],
          schedule_types: [...DEFAULT_SCHEDULE_TYPES],
          rating_scale: DEFAULT_RATING_SCALE as unknown as Json,
          week_starts_on: data.weekStartsOn,
          features,
        });
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "tenant_settings_saved",
      description: "Updated tenant policy and module availability",
      details: { schoolId: data.schoolId },
    });
    return { ok: true };
  });

export const saveBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => brandingSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("school_branding").upsert(
      {
        school_id: data.schoolId,
        display_name: data.displayName ?? "",
        tagline: data.tagline ?? "",
        motto: data.motto ?? "",
        established_year: data.establishedYear ?? "",
        logo_url: data.logoUrl ?? null,
        primary_color: data.primaryColor,
        accent_color: data.accentColor,
        language: data.language,
        locale: data.locale,
        date_format: data.dateFormat,
        show_powered_by: data.showPoweredBy ?? true,
      },
      { onConflict: "school_id" },
    );
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: "branding_saved",
      description: "Updated school branding",
      details: { schoolId: data.schoolId },
    });
    return { ok: true };
  });

/* ---------------------------- numbering ---------------------------- */

/**
 * Upserts one owner's numbering columns, leaving the other owner's untouched.
 * A first save creates the row with the school code derived from the school.
 */
async function upsertNumbering(supabase: any, schoolId: string, columns: Record<string, unknown>) {
  const { data: existing, error: readErr } = await supabase
    .from("numbering_settings").select("school_id").eq("school_id", schoolId).maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (existing) {
    const { error } = await supabase.from("numbering_settings").update(columns).eq("school_id", schoolId);
    if (error) throw new Error(error.message);
    return;
  }
  let school_code = columns["school_code"] as string | undefined;
  if (!school_code) {
    const { data: school } = await supabase.from("schools").select("code").eq("id", schoolId).maybeSingle();
    school_code = schoolCodeDigits(school?.code);
  }
  const { error } = await supabase.from("numbering_settings").insert({ school_id: schoolId, ...columns, school_code });
  if (error) throw new Error(error.message);
}

/** Admission numbering — edited in Operations Configuration. */
export const saveAdmissionNumbering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => admissionNumberingSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    await upsertNumbering(context.supabase, data.schoolId, {
      admission_format: data.admissionFormat,
      admission_total_digits: data.admissionTotalDigits,
      admission_year_digits: data.admissionYearDigits,
      admission_sequence_digits: data.admissionSequenceDigits,
      admission_sequence_start: data.admissionSequenceStart,
    });
    await logAudit(context.supabase, context.userId, {
      action: "numbering_settings_saved",
      description: "Updated admission numbering rules",
      details: { schoolId: data.schoolId, scope: "admission" },
    });
    return { ok: true };
  });

/** School code + employee numbering — edited in System & Platform Configuration. */
export const saveEmployeeNumbering = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => employeeNumberingSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    await upsertNumbering(context.supabase, data.schoolId, {
      school_code: data.schoolCode,
      employee_format: data.employeeFormat,
      employee_total_digits: data.employeeTotalDigits,
      employee_year_digits: data.employeeYearDigits,
      employee_sequence_digits: data.employeeSequenceDigits,
      employee_sequence_start: data.employeeSequenceStart,
      employee_allocation_mode: data.employeeAllocationMode,
    });
    await logAudit(context.supabase, context.userId, {
      action: "numbering_settings_saved",
      description: "Updated school code and employee numbering rules",
      details: { schoolId: data.schoolId, scope: "employee" },
    });
    return { ok: true };
  });

/* --------------------------- operations rules --------------------------- */

/** Operations rules for the active school — any signed-in user. */
export const getOperationsRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await readCalendarRow(context.supabase);
    return parseOpsRules(row?.features?.[OPS_FEATURE_KEY]);
  });

/** Operations Configuration editor: rules + admission numbering for one school. */
export const getSchoolOperationsSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const [row, num] = await Promise.all([
      readCalendarRow(context.supabase, data.schoolId),
      context.supabase.from("numbering_settings").select("*").eq("school_id", data.schoolId).maybeSingle(),
    ]);
    if (num.error) throw new Error(num.error.message);
    return { rules: parseOpsRules(row?.features?.[OPS_FEATURE_KEY]), numbering: num.data ?? null };
  });

export const saveOperationsRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid(), rules: opsRulesSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const saved = await writeVersionedFeature(context.supabase, data.schoolId, OPS_FEATURE_KEY, data.rules, parseOpsRules);
    await logAudit(context.supabase, context.userId, {
      action: "operations_rules_saved",
      description: `Updated operations settings (version ${saved.version})`,
      details: { schoolId: data.schoolId, version: saved.version },
    });
    return { ok: true, version: saved.version };
  });

/* ------------------------- tenant option lists ------------------------- */

/**
 * Positions, departments and schedule types configured under Tenant policy.
 * Readable by any signed-in user so onboarding forms everywhere stay in sync
 * with configuration instead of shipping hardcoded lists.
 */
export const getTenantOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tenant_settings")
      .select("school_id, positions, departments, schedule_types")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);

    return {
      positions: mergePositions(data?.positions?.length ? data.positions : DEFAULT_POSITIONS),
      departments: data?.departments?.length ? data.departments : DEFAULT_DEPARTMENTS,
      scheduleTypes: data?.schedule_types?.length ? data.schedule_types : DEFAULT_SCHEDULE_TYPES,
    };
  });

/** Subject names any signed-in user can pick from (teaching assignments, assessments). */
export const getSubjectOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subjects")
      .select("name, active")
      .order("name");
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).filter((s) => s.active !== false).map((s) => s.name))];
  });

/** Active subjects with the education level each belongs to. */
export const getSubjectCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subjects")
      .select("name, level_code, active")
      .eq("active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((s) => ({ name: s.name, levelCode: s.level_code }));
  });

/* ------------------------------ classes ------------------------------ */

/**
 * Classes belong to an education level the school actually offers, so the
 * catalogue can never drift from what was chosen when the school was
 * provisioned.
 */
export const createSchoolClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schoolClassSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const { data: school } = await supabase
      .from("schools")
      .select("id, level_codes")
      .eq("id", data.schoolId)
      .maybeSingle();
    if (!school) throw new Error("Unknown school.");
    if (!(school.level_codes ?? []).includes(data.levelCode)) {
      throw new Error("That education level is not offered by this school.");
    }

    const { error } = await supabase.from("school_classes").insert({
      school_id: data.schoolId,
      level_code: data.levelCode,
      name: data.name,
      sort_order: data.sortOrder ?? 1,
      active: data.active ?? true,
    });
    if (error) {
      throw new Error(
        error.code === "23505" ? "That class already exists for this school." : error.message,
      );
    }
    await logAudit(supabase, context.userId, {
      action: "class_created",
      description: `Added class ${data.name}`,
      details: { schoolId: data.schoolId, levelCode: data.levelCode },
    });
    return { ok: true };
  });

export const updateSchoolClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchoolClassSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    if (rest.levelCode !== undefined) {
      const { data: cls } = await context.supabase
        .from("school_classes")
        .select("school_id")
        .eq("id", id)
        .maybeSingle();
      const { data: school } = cls
        ? await context.supabase.from("schools").select("level_codes").eq("id", cls.school_id).maybeSingle()
        : { data: null };
      if (!school || !(school.level_codes ?? []).includes(rest.levelCode)) {
        throw new Error("That education level is not offered by this school.");
      }
    }
    const { error } = await context.supabase
      .from("school_classes")
      .update({
        ...(rest.name !== undefined ? { name: rest.name } : {}),
        ...(rest.levelCode !== undefined ? { level_code: rest.levelCode } : {}),
        ...(rest.sortOrder !== undefined ? { sort_order: rest.sortOrder } : {}),
        ...(rest.active !== undefined ? { active: rest.active } : {}),
      })
      .eq("id", id);
    if (error) {
      throw new Error(
        error.code === "23505" ? "That class already exists for this school." : error.message,
      );
    }
    return { ok: true };
  });

export const deleteSchoolClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("school_classes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Active classes, readable by any signed-in user so every module stays in sync. */
export const getSchoolClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("school_classes")
      .select("id, school_id, level_code, name, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: levels } = await context.supabase.from("education_levels").select("code, name");
    const levelName = new Map((levels ?? []).map((l) => [l.code, l.name]));
    return (data ?? []).map((c) => ({
      id: c.id,
      schoolId: c.school_id,
      levelCode: c.level_code,
      levelName: levelName.get(c.level_code) ?? c.level_code,
      name: c.name,
    }));
  });

/* ------------------------- academic calendar ------------------------- */

/**
 * Stored inside tenant_settings.features under CALENDAR_FEATURE_KEY so it
 * needs no new table; module switches ignore it (mergedFeatures is boolean-only).
 */
async function readCalendarRow(supabase: any, schoolId?: string) {
  let q = supabase.from("tenant_settings").select("school_id, features, academic_year_start_month, grading_system");
  q = schoolId ? q.eq("school_id", schoolId) : q.order("created_at", { ascending: true }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  return data as { school_id: string; features: Record<string, unknown> | null; academic_year_start_month: number; grading_system: string } | null;
}

export const STALE_SETTINGS_MESSAGE = "These settings were changed by someone else. Reload and try again.";

/**
 * Single write path for a versioned settings entry stored in tenant_settings.features.
 * Rejects stale copies, bumps the version, re-reads right before writing so other
 * domains' keys are preserved, and uses a compare-and-set on the stored version.
 */
async function writeVersionedFeature<T extends { version: number }>(
  supabase: any,
  schoolId: string,
  key: string,
  incoming: T,
  parse: (raw: unknown) => T,
  columns: Record<string, unknown> = {},
): Promise<T> {
  const row = await readCalendarRow(supabase, schoolId);
  const stored = row?.features?.[key] as { version?: unknown } | undefined;
  const current = parse(stored);
  if (current.version !== incoming.version) throw new Error(STALE_SETTINGS_MESSAGE);
  const next = { ...incoming, version: current.version + 1 };
  const features = { ...(row?.features ?? defaultModuleFeatures()), [key]: next } as unknown as Json;

  if (!row) {
    const { error } = await supabase.from("tenant_settings").insert({ school_id: schoolId, ...columns, features });
    if (error) throw new Error(error.code === "23505" ? STALE_SETTINGS_MESSAGE : error.message);
    return next;
  }
  let q = supabase.from("tenant_settings").update({ ...columns, features }).eq("school_id", schoolId);
  if (typeof stored?.version === "number") q = q.eq(`features->${key}->>version`, String(stored.version));
  const { data: written, error } = await q.select("school_id");
  if (error) throw new Error(error.message);
  if (!written?.length) throw new Error(STALE_SETTINGS_MESSAGE);
  return next;
}

/** The academic calendar for the active school — readable by any signed-in user. */
export const getAcademicCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await readCalendarRow(context.supabase);
    return parseCalendar(row?.features?.[CALENDAR_FEATURE_KEY], row?.academic_year_start_month ?? 9);
  });

/** Calendar for one school (System Configuration editor). */
export const getSchoolCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const row = await readCalendarRow(context.supabase, data.schoolId);
    return parseCalendar(row?.features?.[CALENDAR_FEATURE_KEY], row?.academic_year_start_month ?? 9);
  });

export const saveAcademicCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ schoolId: z.string().uuid(), calendar: calendarSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const row = await readCalendarRow(context.supabase, data.schoolId);
    const startMonth = row?.academic_year_start_month ?? 9;
    const saved = await writeVersionedFeature(context.supabase, data.schoolId, CALENDAR_FEATURE_KEY, data.calendar, (raw) =>
      parseCalendar(raw, startMonth),
    );
    await logAudit(context.supabase, context.userId, {
      action: "academic_calendar_saved",
      description: `Academic calendar set to ${data.calendar.periods.length} ${data.calendar.mode}s (${data.calendar.academicYear})`,
      details: { schoolId: data.schoolId, version: saved.version },
    });
    return { ok: true, version: saved.version };
  });

/* ------------------------- academic rules ------------------------- */

/** Grading bands and academic rules for the active school — any signed-in user. */
export const getAcademicRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await readCalendarRow(context.supabase);
    return parseRules(row?.features?.[RULES_FEATURE_KEY]);
  });

/** Academic Configuration editor: grading system, year start and rules for one school. */
export const getSchoolAcademicSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const row = await readCalendarRow(context.supabase, data.schoolId);
    return {
      gradingSystem: (row?.grading_system ?? "letter") as (typeof GRADING_SYSTEMS)[number],
      academicYearStartMonth: row?.academic_year_start_month ?? 9,
      rules: parseRules(row?.features?.[RULES_FEATURE_KEY]),
    };
  });

export const saveAcademicSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        schoolId: z.string().uuid(),
        gradingSystem: z.enum(GRADING_SYSTEMS),
        academicYearStartMonth: z.number().int().min(1).max(12),
        rules: rulesSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const saved = await writeVersionedFeature(context.supabase, data.schoolId, RULES_FEATURE_KEY, data.rules, parseRules, {
      grading_system: data.gradingSystem,
      academic_year_start_month: data.academicYearStartMonth,
    });
    await logAudit(context.supabase, context.userId, {
      action: "academic_rules_saved",
      description: `Updated grading and academic rules (version ${saved.version})`,
      details: { schoolId: data.schoolId, version: saved.version },
    });
    return { ok: true, version: saved.version };
  });

/* -------------------------- people rules -------------------------- */

const peopleList = z.array(z.string().trim().min(1).max(80)).max(60);

/** People rules for the active school — any signed-in user. */
export const getPeopleRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const row = await readCalendarRow(context.supabase);
    return parsePeopleRules(row?.features?.[PEOPLE_FEATURE_KEY]);
  });

/** People Configuration editor: staff lists and people rules for one school. */
export const getSchoolPeopleSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ schoolId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("tenant_settings")
      .select("positions, departments, schedule_types, features")
      .eq("school_id", data.schoolId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      positions: row?.positions?.length ? row.positions : [...DEFAULT_POSITIONS],
      departments: row?.departments?.length ? row.departments : [...DEFAULT_DEPARTMENTS],
      scheduleTypes: row?.schedule_types?.length ? row.schedule_types : [...DEFAULT_SCHEDULE_TYPES],
      rules: parsePeopleRules((row?.features as Record<string, unknown> | null)?.[PEOPLE_FEATURE_KEY]),
    };
  });

export const savePeopleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        schoolId: z.string().uuid(),
        positions: peopleList.min(1, "Keep at least one position."),
        departments: peopleList,
        scheduleTypes: peopleList,
        rules: peopleRulesSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const rules = await writeVersionedFeature(context.supabase, data.schoolId, PEOPLE_FEATURE_KEY, data.rules, parsePeopleRules, {
      positions: data.positions,
      departments: data.departments,
      schedule_types: data.scheduleTypes,
    });
    await logAudit(context.supabase, context.userId, {
      action: "people_rules_saved",
      description: `Updated people settings (version ${rules.version})`,
      details: { schoolId: data.schoolId, version: rules.version },
    });
    return { ok: true, version: rules.version };
  });
