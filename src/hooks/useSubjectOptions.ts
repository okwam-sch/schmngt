import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSubjectCatalog } from "@/lib/config.functions";
import type { LevelRef } from "@/lib/teaching-levels";

/**
 * Subjects configured under System Configuration → Subjects, each tied to its
 * education level. Single source of truth for every module that picks a subject.
 */
export function useSubjectOptions(): { subjects: string[]; catalog: LevelRef[]; loading: boolean } {
  const load = useServerFn(getSubjectCatalog);
  const [catalog, setCatalog] = useState<LevelRef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void load()
      .then((rows) => {
        if (active) setCatalog(rows as LevelRef[]);
      })
      .catch(() => setCatalog([]))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { subjects: [...new Set(catalog.map((s) => s.name))], catalog, loading };
}
