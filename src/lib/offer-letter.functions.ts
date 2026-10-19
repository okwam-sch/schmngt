import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin.server";
import { eligibleForOffer } from "@/lib/offer-letter";
import { PEOPLE_FEATURE_KEY, letterTerms, parsePeopleRules } from "@/lib/people-rules";

export const getAppointmentLetter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), kind: z.enum(["account", "offer"]) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = context.supabase;
    const [schools, branding, signers, managers] = await Promise.all([
      db.from("schools").select("id, name, postal_address, town, community, district, region, gps_address").eq("active", true).order("name"),
      db.from("school_branding").select("school_id, display_name, logo_url"),
      db.from("profiles").select("id, full_name, email").eq("role", "super_admin").eq("status", "active").order("full_name"),
      db.from("profiles").select("full_name").eq("role", "school_manager").eq("status", "active").order("full_name"),
    ]);
    const failure = schools.error ?? branding.error ?? signers.error ?? managers.error;
    if (failure) throw new Error(failure.message);
    let employee;
    if (data.kind === "account") {
      const result = await db.from("profiles").select("id, full_name, email, role, position, salary, start_date, created_at, employee_id").eq("id", data.id).single();
      if (result.error) throw new Error(result.error.message);
      if (!eligibleForOffer(result.data.role)) throw new Error("Offer letters are available for staff and school managers only.");
      employee = { id: result.data.id, name: result.data.full_name, email: result.data.email, role: result.data.role === "school_manager" ? "School Manager" : "Staff", position: result.data.position, salary: result.data.salary, startDate: result.data.start_date, onboardedAt: result.data.created_at, employeeId: result.data.employee_id };
    } else {
      const result = await db.from("offer_letters").select("id, candidate_name, candidate_email, position, salary, start_date, created_at").eq("id", data.id).single();
      if (result.error) throw new Error(result.error.message);
      employee = { id: result.data.id, name: result.data.candidate_name, email: result.data.candidate_email, role: "", position: result.data.position, salary: result.data.salary, startDate: result.data.start_date, onboardedAt: result.data.created_at, employeeId: null };
    }
    const yearStart = `${employee.onboardedAt.slice(0, 4)}-01-01T00:00:00Z`;
    const seqQuery = data.kind === "account"
      ? db.from("profiles").select("id", { count: "exact", head: true }).in("role", ["staff", "school_manager"])
      : db.from("offer_letters").select("id", { count: "exact", head: true });
    const [numbering, seqCount, tenant] = await Promise.all([
      db.from("numbering_settings").select("school_id, school_code, employee_year_digits, employee_sequence_digits, employee_sequence_start"),
      seqQuery.gte("created_at", yearStart).lte("created_at", employee.onboardedAt),
      db.from("tenant_settings").select("school_id, features"),
    ]);
    if (numbering.error) throw new Error(numbering.error.message);
    const rank = Math.max(seqCount.count ?? 1, 1);
    return {
      employee,
      schools: (schools.data ?? []).map((school) => {
        const brand = branding.data?.find((b) => b.school_id === school.id);
        const n = numbering.data?.find((row) => row.school_id === school.id);
        return { ...school, name: brand?.display_name || school.name, logoUrl: brand?.logo_url ?? null,
          numbering: { schoolCode: n?.school_code ?? "", yearDigits: n?.employee_year_digits ?? 2, sequenceDigits: n?.employee_sequence_digits ?? 4 },
          sequence: (n?.employee_sequence_start ?? 1) + rank - 1,
          terms: letterTerms(parsePeopleRules((tenant.data?.find((t) => t.school_id === school.id)?.features as Record<string, unknown> | null)?.[PEOPLE_FEATURE_KEY])) };
      }),
      signers: signers.data ?? [],
      managers: (managers.data ?? []).map((manager) => manager.full_name),
    };
  });