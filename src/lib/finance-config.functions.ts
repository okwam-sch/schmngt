import { createServerFn } from "@tanstack/react-start";
import { resolveProvisionedSchool } from "@/lib/school.server";
import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSuperAdmin, isSuperAdmin } from "@/lib/admin.server";
import {
  DEFAULT_LISTS,
  FINANCE_AREAS,
  STATUS_TRANSITIONS,
  defaultSettings,
  getSection,
  type ConfigStatus,
} from "@/lib/finance-config";
import {
  deleteSchema,
  referenceItemSchema,
  ruleSchema,
  saveSectionSchema,
  schoolScope,
  sectionStatusSchema,
} from "@/lib/finance-config.schemas";

type Ctx = { supabase: any; userId: string };

async function audit(
  { supabase, userId }: Ctx,
  schoolId: string | null,
  sectionKey: string,
  action: string,
  description: string,
  details: Record<string, unknown> = {},
) {
  const { data: actor } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
  await supabase.from("finance_config_audit").insert({
    school_id: schoolId,
    section_key: sectionKey,
    action,
    description,
    actor_id: userId,
    actor_email: actor?.email ?? null,
    details,
  });
}

/** Everything the Financial Configuration module needs for one school. */
export const getFinanceConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schoolScope.partial().parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: schools, error: sErr } = await supabase
      .from("schools")
      .select("id, name, code, currency, locale, active")
      .order("active", { ascending: false })
      .order("created_at");
    if (sErr) throw new Error(sErr.message);

    const schoolId = data.schoolId ?? schools?.[0]?.id ?? null;
    if (!schoolId) {
      return { schools: schools ?? [], schoolId: null, sections: [], items: [], rules: [], audit: [] };
    }
    await autoSeedIfEmpty(context as Ctx, schoolId);

    const [sections, items, rules, auditRows] = await Promise.all([
      supabase
        .from("finance_config_sections")
        .select("*")
        .eq("school_id", schoolId)
        .order("section_key")
        .order("version", { ascending: false }),
      supabase
        .from("finance_reference_items")
        .select("*")
        .eq("school_id", schoolId)
        .order("list_key")
        .order("sort_order"),
      supabase
        .from("finance_rules")
        .select("*")
        .eq("school_id", schoolId)
        .order("rule_key")
        .order("priority"),
      supabase
        .from("finance_config_audit")
        .select("id, section_key, action, description, actor_email, created_at")
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const failure = sections.error ?? items.error ?? rules.error;
    if (failure) throw new Error(failure.message);

    return {
      schools: schools ?? [],
      schoolId,
      sections: sections.data ?? [],
      items: items.data ?? [],
      rules: rules.data ?? [],
      audit: auditRows.data ?? [],
    };
  });

/**
 * The read path every other financial module uses: only what is in force
 * today. Any signed-in user may read it, because it drives pickers and
 * labels across the finance screens.
 */
export const getActiveFinanceConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);

    const school = await resolveProvisionedSchool(supabase);
    if (!school)
      return {
        schoolId: null as string | null,
        currencyFallback: { code: "GHS", locale: "en-GH" },
        settings: {} as Record<string, Record<string, Json>>,
        items: [],
        rules: [],
      };
    await autoSeedIfEmpty(context as Ctx, school.id);

    const [sections, items, rules] = await Promise.all([
      supabase
        .from("finance_config_sections")
        .select("section_key, payload, effective_from, version")
        .eq("school_id", school.id)
        .eq("status", "active")
        .order("version", { ascending: false }),
      supabase
        .from("finance_reference_items")
        .select("*")
        .eq("school_id", school.id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("finance_rules")
        .select("*")
        .eq("school_id", school.id)
        .eq("active", true)
        .order("priority"),
    ]);

    const settings: Record<string, Record<string, Json>> = {};
    for (const row of sections.data ?? []) {
      if (row.effective_from && row.effective_from > today) continue;
      if (!settings[row.section_key])
        settings[row.section_key] = (row.payload ?? {}) as Record<string, Json>;
    }

    return {
      schoolId: school.id as string | null,
      currencyFallback: { code: school.currency, locale: school.locale },
      settings,
      items: items.data ?? [],
      rules: rules.data ?? [],
    };
  });

/* --------------------------- settings sections --------------------------- */

export const saveFinanceSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabase } = context;
    const entry = getSection(data.sectionKey);
    if (!entry) throw new Error("Unknown configuration section.");

    const { data: existing, error: rErr } = await supabase
      .from("finance_config_sections")
      .select("id, version, status")
      .eq("school_id", data.schoolId)
      .eq("section_key", data.sectionKey)
      .order("version", { ascending: false });
    if (rErr) throw new Error(rErr.message);

    const draft = (existing ?? []).find((r: any) => r.status === "draft");
    const nextVersion = ((existing ?? [])[0]?.version ?? 0) + 1;

    if (draft && !data.newVersion) {
      const { error } = await supabase
        .from("finance_config_sections")
        .update({
          payload: data.payload as Json,
          notes: data.notes,
          effective_from: data.effectiveFrom,
        })
        .eq("id", draft.id);
      if (error) throw new Error(error.message);
      await audit(context as Ctx, data.schoolId, data.sectionKey, "config_draft_saved", `Updated draft for ${entry.section.name}`);
      return { id: draft.id, version: draft.version };
    }

    const { data: created, error } = await supabase
      .from("finance_config_sections")
      .insert({
        school_id: data.schoolId,
        area_key: entry.area.key,
        section_key: data.sectionKey,
        version: nextVersion,
        status: "draft",
        payload: data.payload as Json,
        notes: data.notes,
        effective_from: data.effectiveFrom,
        created_by: context.userId,
      })
      .select("id, version")
      .single();
    if (error) throw new Error(error.message);
    await audit(context as Ctx, data.schoolId, data.sectionKey, "config_version_created", `Created version ${nextVersion} of ${entry.section.name}`);
    return created;
  });

export const setFinanceSectionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sectionStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabase } = context;

    const { data: row, error: rErr } = await supabase
      .from("finance_config_sections")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!row) throw new Error("That configuration version no longer exists.");

    const from = row.status as ConfigStatus;
    if (!STATUS_TRANSITIONS[from]?.includes(data.status)) {
      throw new Error(`A ${from} version cannot move straight to ${data.status}.`);
    }

    if (data.status === "active") {
      const { error: supErr } = await supabase
        .from("finance_config_sections")
        .update({ status: "superseded", effective_to: new Date().toISOString().slice(0, 10) })
        .eq("school_id", row.school_id)
        .eq("section_key", row.section_key)
        .eq("status", "active");
      if (supErr) throw new Error(supErr.message);
    }

    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "approved") {
      patch['approved_by'] = context.userId;
      patch['approved_at'] = new Date().toISOString();
    }
    if (data.status === "active" && !row.effective_from) {
      patch['effective_from'] = new Date().toISOString().slice(0, 10);
    }

    const { error } = await supabase.from("finance_config_sections").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(
      context as Ctx,
      row.school_id,
      row.section_key,
      `config_${data.status}`,
      `Version ${row.version} moved from ${from} to ${data.status}`,
    );
    return { ok: true };
  });

/* ----------------------------- reference lists ----------------------------- */

export const saveFinanceItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => referenceItemSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const row = {
      school_id: data.schoolId,
      list_key: data.listKey,
      code: data.code,
      name: data.name,
      description: data.description,
      parent_code: data.parentCode ?? null,
      sort_order: data.sortOrder,
      active: data.active,
      metadata: data.metadata as Json,
    };

    const query = data.id
      ? context.supabase.from("finance_reference_items").update(row as never).eq("id", data.id)
      : context.supabase.from("finance_reference_items").insert(row as never);
    const { error } = await query;
    if (error) {
      if (error.code === "23505") throw new Error("That code already exists in this list.");
      throw new Error(error.message);
    }
    await audit(
      context as Ctx,
      data.schoolId,
      data.listKey,
      data.id ? "config_item_updated" : "config_item_added",
      `${data.id ? "Updated" : "Added"} ${data.name}`,
    );
    return { ok: true };
  });

export const saveFinanceRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ruleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const row = {
      school_id: data.schoolId,
      rule_key: data.ruleKey,
      name: data.name,
      description: data.description,
      priority: data.priority,
      conditions: data.conditions as Json,
      actions: data.actions as Json,
      effective_from: data.effectiveFrom,
      effective_to: data.effectiveTo,
      active: data.active,
    };

    const query = data.id
      ? context.supabase.from("finance_rules").update(row as never).eq("id", data.id)
      : context.supabase.from("finance_rules").insert(row as never);
    const { error } = await query;
    if (error) {
      if (error.code === "23505") throw new Error("A rule with that name already exists here.");
      throw new Error(error.message);
    }
    await audit(
      context as Ctx,
      data.schoolId,
      data.ruleKey,
      data.id ? "config_rule_updated" : "config_rule_added",
      `${data.id ? "Updated" : "Added"} rule ${data.name}`,
    );
    return { ok: true };
  });

export const deleteFinanceConfigRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const table =
      data.kind === "item"
        ? "finance_reference_items"
        : data.kind === "rule"
          ? "finance_rules"
          : "finance_config_sections";
    const { error } = await context.supabase.from(table as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Writes the platform starting point for a school: the categories, methods
 * and statuses that used to be hardcoded, plus the default settings
 * documents, activated straight away. Existing entries are never touched.
 */
async function writeDefaults(ctx: Ctx, schoolId: string) {
  const { supabase } = ctx;
  const { data: school, error: sErr } = await supabase
    .from("schools")
    .select("id, currency, locale")
    .eq("id", schoolId)
    .maybeSingle();
  if (sErr) throw new Error(sErr.message);
  if (!school) throw new Error("That school no longer exists.");

  const { data: existingItems } = await supabase
    .from("finance_reference_items")
    .select("list_key, code")
    .eq("school_id", school.id);
  const known = new Set((existingItems ?? []).map((i: any) => `${i.list_key}:${i.code}`));

  const rows = Object.entries(DEFAULT_LISTS).flatMap(([listKey, items]) =>
    items
      .filter((i) => !known.has(`${listKey}:${i.code}`))
      .map((i) => ({
        school_id: school.id,
        list_key: listKey,
        code: i.code,
        name: i.name,
        sort_order: i.sort_order,
      })),
  );
  if (rows.length > 0) {
    const { error } = await supabase.from("finance_reference_items").insert(rows as never);
    if (error) throw new Error(error.message);
  }

  const { data: existingSections } = await supabase
    .from("finance_config_sections")
    .select("section_key")
    .eq("school_id", school.id);
  const haveSection = new Set((existingSections ?? []).map((s: any) => s.section_key));

  const sectionRows = FINANCE_AREAS.flatMap((area) =>
    area.sections
      .filter((s) => s.kind === "settings" && !haveSection.has(s.key))
      .map((s) => ({ area, section: s, payload: defaultSettings(s.key, school) }))
      .filter((x) => x.payload)
      .map((x) => ({
        school_id: school.id,
        area_key: x.area.key,
        section_key: x.section.key,
        version: 1,
        status: "active",
        effective_from: new Date().toISOString().slice(0, 10),
        payload: x.payload,
        notes: "Seeded platform default.",
        created_by: ctx.userId,
      })),
  );
  if (sectionRows.length > 0) {
    const { error } = await supabase.from("finance_config_sections").insert(sectionRows as never);
    if (error) throw new Error(error.message);
  }

  await audit(ctx, school.id, "seed", "config_seeded", "Loaded platform financial defaults", {
    items: rows.length,
    sections: sectionRows.length,
  });
  return { items: rows.length, sections: sectionRows.length };
}

/**
 * Automatic loading: a school with no configuration at all gets the platform
 * defaults the first time a Super Admin opens any finance screen. Schools
 * that already have configuration are left alone, so deleted defaults stay
 * deleted.
 */
async function autoSeedIfEmpty(ctx: Ctx, schoolId: string) {
  const [{ count: itemCount }, { count: sectionCount }] = await Promise.all([
    ctx.supabase.from("finance_reference_items").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    ctx.supabase.from("finance_config_sections").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
  ]);
  if ((itemCount ?? 0) > 0 || (sectionCount ?? 0) > 0) return false;
  if (!(await isSuperAdmin(ctx.supabase, ctx.userId))) return false;
  await writeDefaults(ctx, schoolId);
  return true;
}

export const seedFinanceDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schoolScope.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabase } = context;

    return writeDefaults(context as Ctx, data.schoolId);
  });
