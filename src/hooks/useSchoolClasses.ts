import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSchoolClasses } from "@/lib/config.functions";

export interface SchoolClassOption {
  id: string;
  schoolId: string;
  levelCode: string;
  levelName: string;
  name: string;
}

/**
 * The classes configured for the provisioned school(s) under System
 * Configuration → Classes. Single source of truth: every module that needs a
 * class list reads it from here instead of shipping its own hardcoded list.
 */
export function useSchoolClasses(): {
  classes: SchoolClassOption[];
  names: string[];
  /** Education levels that have at least one class, in class order. */
  levels: { code: string; name: string }[];
  loading: boolean;
} {
  const load = useServerFn(getSchoolClasses);
  const [classes, setClasses] = useState<SchoolClassOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void load()
      .then((rows) => {
        if (!active) return;
        setClasses(rows as SchoolClassOption[]);
      })
      .catch(() => setClasses([]))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const levels = [...new Map(classes.map((c) => [c.levelCode, { code: c.levelCode, name: c.levelName }])).values()];
  return { classes, names: classes.map((c) => c.name), levels, loading };
}
