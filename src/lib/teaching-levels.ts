/**
 * Teaching pairs must respect education levels: a teacher only teaches a
 * subject in a class when both belong to the same education level.
 * Pure — shared by the user form (preview/filter) and the server (enforce).
 */
export interface LevelRef {
  name: string;
  levelCode: string;
}

const key = (s: string) => s.trim().toLowerCase();

export function matchTeachingPairs(
  classes: string[],
  subjects: string[],
  classCatalog: LevelRef[],
  subjectCatalog: LevelRef[],
) {
  const classLevel = new Map(classCatalog.map((c) => [key(c.name), c.levelCode]));
  const subjectLevels = new Map<string, Set<string>>();
  for (const s of subjectCatalog) {
    const k = key(s.name);
    if (!subjectLevels.has(k)) subjectLevels.set(k, new Set());
    subjectLevels.get(k)!.add(s.levelCode);
  }
  const uClasses = [...new Set(classes)];
  const uSubjects = [...new Set(subjects)];
  const pairs: { class_name: string; subject: string }[] = [];
  const usedClasses = new Set<string>();
  const usedSubjects = new Set<string>();
  for (const c of uClasses) {
    const lvl = classLevel.get(key(c));
    if (!lvl) continue;
    for (const s of uSubjects) {
      if (subjectLevels.get(key(s))?.has(lvl)) {
        pairs.push({ class_name: c, subject: s });
        usedClasses.add(c);
        usedSubjects.add(s);
      }
    }
  }
  return {
    pairs,
    unmatchedClasses: uClasses.filter((c) => !usedClasses.has(c)),
    unmatchedSubjects: uSubjects.filter((s) => !usedSubjects.has(s)),
  };
}

export function teachingLevelError(r: ReturnType<typeof matchTeachingPairs>): string | null {
  if (r.unmatchedSubjects.length)
    return `${r.unmatchedSubjects.join(", ")} ${r.unmatchedSubjects.length > 1 ? "are" : "is"} not offered at the education level of any selected class.`;
  if (r.unmatchedClasses.length)
    return `No selected subject belongs to the education level of ${r.unmatchedClasses.join(", ")}.`;
  return null;
}
