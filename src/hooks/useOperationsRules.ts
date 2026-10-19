import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOperationsRules } from "@/lib/config.functions";
import { defaultOpsRules, type OpsRules } from "@/lib/operations-rules";

let cache: { at: number; rules: OpsRules } | null = null;
export function invalidateOperationsRules() {
  cache = null;
}

/** Operations rules from Operations Configuration (60s cache). */
export function useOperationsRules() {
  const load = useServerFn(getOperationsRules);
  const [rules, setRules] = useState<OpsRules>(cache?.rules ?? defaultOpsRules());
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
