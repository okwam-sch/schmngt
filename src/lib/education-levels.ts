/**
 * Education-level scoping — the single place that decides which level a
 * class belongs to, which subjects a class offers, and whether a financial
 * item (fee, charge, discount…) applies to a level and at what amount.
 * Pure and browser-safe: the UI previews with it, the server enforces with it.
 */
import type { LevelRef } from "./teaching-levels";

const key = (s: string) => s.trim().toLowerCase();

/** Level code of a named class, or null when the class is unknown. */
export function levelOfClass(classCatalog: LevelRef[], className: string | null | undefined): string | null {
  if (!className) return null;
  return classCatalog.find((c) => key(c.name) === key(className))?.levelCode ?? null;
}

/** Subjects offered in a class — only those of the class's own education level. */
export function subjectsForClass(subjectCatalog: LevelRef[], classCatalog: LevelRef[], className: string): string[] {
  const lvl = levelOfClass(classCatalog, className);
  if (!lvl) return [];
  return [...new Set(subjectCatalog.filter((s) => s.levelCode === lvl).map((s) => s.name))];
}

/**
 * Level scope stored on a financial item as metadata.levels:
 * "" = every level; otherwise "CODE" or "CODE:amount" joined by commas,
 * where the amount overrides the item's base amount for that level.
 */
export const LEVEL_SCOPE_KEY = "levels";
export type LevelScope = Map<string, number | null>;

export function parseLevelScope(raw: unknown): LevelScope {
  const scope: LevelScope = new Map();
  for (const part of String(raw ?? "").split(",")) {
    const [code, amt] = part.split(":").map((x) => x.trim());
    if (!code) continue;
    const n = amt === undefined || amt === "" ? null : Number(amt);
    scope.set(code, n !== null && Number.isFinite(n) ? n : null);
  }
  return scope;
}

export function serializeLevelScope(scope: LevelScope): string {
  return [...scope].map(([c, a]) => (a === null ? c : `${c}:${a}`)).join(",");
}

/** Whether an item applies to a level. Unscoped items apply everywhere; unknown levels match only unscoped items. */
export function appliesToLevel(raw: unknown, levelCode: string | null | undefined): boolean {
  const scope = parseLevelScope(raw);
  if (scope.size === 0) return true;
  return !!levelCode && scope.has(levelCode);
}

/** The amount charged at a level: the level override, else the base amount. */
export function amountForLevel(metadata: Record<string, unknown> | null | undefined, levelCode: string | null | undefined): number {
  const base = Number(metadata?.["amount"] ?? 0) || 0;
  if (!levelCode) return base;
  const override = parseLevelScope(metadata?.[LEVEL_SCOPE_KEY]).get(levelCode);
  return override ?? base;
}

/** Error text when an item is used outside its levels, else null. */
export function levelScopeError(itemName: string, raw: unknown, levelCode: string | null, levelName?: string): string | null {
  if (appliesToLevel(raw, levelCode)) return null;
  return `${itemName} does not apply to ${levelName ?? levelCode ?? "this learner's education level"}.`;
}
