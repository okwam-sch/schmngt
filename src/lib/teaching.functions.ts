import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Every teaching assignment (teacher → class → subject) in the school. */
export const listTeachingAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("teaching_assignments")
      .select("id, teacher_id, class_name, subject")
      .order("class_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** The classes and subjects one member of staff teaches. */
export const getTeachingAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ teacherId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("teaching_assignments")
      .select("id, teacher_id, class_name, subject")
      .eq("teacher_id", data.teacherId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** The signed-in user's own teaching scope (admins: unrestricted). */
export const getMyTeachingScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTeachingScope } = await import("@/lib/teaching.server");
    return loadTeachingScope(context.supabase, context.userId);
  });
