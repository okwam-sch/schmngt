import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getAcademicRules } from "@/lib/config.functions";
import { defaultRules, type AcademicRules } from "@/lib/academic-rules";

let cache: { at: number; rules: AcademicRules } | null = null;
export function invalidateAcademicRules() {
  cache = null;
}

/** Academic rules from Academic Configuration (60s cache). */
export function useAcademicRules() {
  const load = useServerFn(getAcademicRules);
  const [rules, setRules] = useState<AcademicRules>(cache?.rules ?? defaultRules());
  useEffect(() => {
    if (cache && Date.now() - cache.at < 60_000) return;
    let on = true;
    void load()
      .then((r) => {
        cache = { at: Date.now(), rules: r };
        if (on) setRules(r);
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  return rules;
}
