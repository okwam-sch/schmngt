/* ------------------------------------------------------------------ *
 * Data Access rules (Reporting & Records Configuration → Data Access).
 *
 * Pure, browser-safe evaluation of who may view historical records and
 * who may export them. The server enforces these; the UI only mirrors.
 *
 * Record access rule (finance_rules, rule_key "record-access-rules"):
 *   conditions: { roles: "school_manager", sources: "*" | "fees,payments",
 *                 states: "current,archived" }   (strings or arrays)
 * Export controls (settings section "export-controls"):
 *   { allow_export: "yes"|"no", export_roles: "school_manager", watermark: "yes"|"no" }
 *
 * Super Admin is never restricted. Everyone else is denied unless an
 * active rule grants them access (deny by default).
 * ------------------------------------------------------------------ */

export const RECORD_STATES = ["current", "archived", "disposal-due"] as const;
export type RecordState = (typeof RECORD_STATES)[number];

export interface AccessRuleRow {
  name?: string;
  active?: boolean | null;
  conditions?: unknown;
}

export interface AccessGrant {
  roles: string[];
  sources: string[] | "*";
  states: RecordState[];
}

const toList = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** Valid grants only; malformed rules (no roles, no states) are ignored, never widened. */
export function parseAccessRules(rows: AccessRuleRow[]): AccessGrant[] {
  const out: AccessGrant[] = [];
  for (const r of rows) {
    if (r.active === false) continue;
    const c = (r.conditions && typeof r.conditions === "object" ? r.conditions : {}) as Record<string, unknown>;
    const roles = toList(c["roles"]);
    const srcList = toList(c["sources"]);
    const stateList = toList(c["states"] ?? "current,archived,disposal-due");
    const states = stateList.filter((s): s is RecordState => (RECORD_STATES as readonly string[]).includes(s));
    if (!roles.length || !states.length) continue;
    out.push({ roles, sources: !srcList.length || srcList.includes("*") ? "*" : srcList, states });
  }
  return out;
}

/** States of one source the caller may see. Empty = no access. */
export function allowedStates(userRoles: string[], grants: AccessGrant[], source: string): Set<RecordState> {
  if (userRoles.includes("super_admin")) return new Set(RECORD_STATES);
  const set = new Set<RecordState>();
  for (const g of grants) {
    if (!g.roles.some((r) => userRoles.includes(r))) continue;
    if (g.sources !== "*" && !g.sources.includes(source.toLowerCase())) continue;
    g.states.forEach((s) => set.add(s));
  }
  return set;
}

export interface ExportControls {
  allowExport: boolean;
  roles: string[];
  watermark: boolean;
}

export function parseExportControls(payload: Record<string, unknown> | null | undefined): ExportControls {
  const p = payload ?? {};
  return {
    allowExport: String(p["allow_export"] ?? "no").toLowerCase() === "yes",
    roles: toList(p["export_roles"]),
    watermark: String(p["watermark"] ?? "no").toLowerCase() === "yes",
  };
}

/** Super Admin may always export; others need exports on and their role listed. */
export function canExport(userRoles: string[], c: ExportControls): boolean {
  if (userRoles.includes("super_admin")) return true;
  return c.allowExport && c.roles.some((r) => userRoles.includes(r));
}

export function watermarkText(schoolName: string, email: string, at: string) {
  return `${schoolName} — exported by ${email || "unknown"} on ${at.slice(0, 16).replace("T", " ")} UTC — confidential`;
}
