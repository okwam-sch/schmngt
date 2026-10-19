import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getActiveFinanceConfig } from "@/lib/finance-config.functions";
import { formatNumber } from "@/lib/numbering";
import {
  currencySymbol,
  numberingTemplate,
  optionsFrom,
  type FinanceRule,
  type ReferenceItem,
} from "@/lib/finance-config";

export interface ActiveFinanceConfig {
  schoolId: string | null;
  settings: Record<string, Record<string, unknown>>;
  items: ReferenceItem[];
  rules: FinanceRule[];
  loading: boolean;
  /** Configured options for a list, falling back to the platform defaults. */
  options: (
    listKey: string,
    fallback: readonly { value: string; label: string }[],
  ) => { value: string; label: string }[];
  money: (amount: number | string | null | undefined) => string;
  symbol: string;
  /** A document number (invoice, receipt, voucher...) from its configured template. */
  documentNumber: (sectionKey: string, sequence: number, schoolCode?: string) => string | null;
}

const EMPTY: Record<string, Record<string, unknown>> = {};

interface CachedConfig {
  schoolId: string | null;
  settings: Record<string, Record<string, unknown>>;
  items: ReferenceItem[];
  rules: FinanceRule[];
  at: number;
}

/** Active-version cache: the config in force right now, shared across screens. */
let cache: CachedConfig | null = null;
let inflight: Promise<CachedConfig | null> | null = null;
const CACHE_TTL_MS = 60_000;

/** Drop the cached active config (call after a configuration change is published). */
export function invalidateFinanceConfigCache() {
  cache = null;
}

/**
 * The single read path into Financial Configuration. Every finance screen
 * uses this instead of its own hardcoded lists, so the configuration is the
 * only source of truth for financial behaviour. The active version is cached
 * for a minute so navigating between finance screens does not refetch it.
 */
export function useFinanceConfig(): ActiveFinanceConfig {
  const load = useServerFn(getActiveFinanceConfig);
  const [state, setState] = useState<{
    schoolId: string | null;
    settings: Record<string, Record<string, unknown>>;
    items: ReferenceItem[];
    rules: FinanceRule[];
    loading: boolean;
  }>(() =>
    cache && Date.now() - cache.at < CACHE_TTL_MS
      ? { schoolId: cache.schoolId, settings: cache.settings, items: cache.items, rules: cache.rules, loading: false }
      : { schoolId: null, settings: EMPTY, items: [], rules: [], loading: true },
  );

  useEffect(() => {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return;
    let active = true;
    inflight ??= load()
      .then((res) => {
        const r = res as {
          schoolId: string | null;
          settings: Record<string, Record<string, unknown>>;
          items: ReferenceItem[];
          rules: FinanceRule[];
          currencyFallback?: { code: string; locale: string };
        };
        const stored = (r.settings ?? EMPTY) as Record<string, Record<string, unknown>>;
        // The school's starting currency applies until Financial Configuration → Currency is saved.
        const settings = stored["currency"] || !r.currencyFallback
          ? stored
          : { ...stored, currency: { code: r.currencyFallback.code, locale: r.currencyFallback.locale } };
        const next: CachedConfig = {
          schoolId: r.schoolId ?? null,
          settings,
          items: (r.items ?? []) as ReferenceItem[],
          rules: (r.rules ?? []) as FinanceRule[],
          at: Date.now(),
        };
        cache = next;
        return next;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
    void inflight.then((next) => {
      if (!active || !next) {
        if (active && !next) setState((s) => ({ ...s, loading: false }));
        return;
      }
      setState({
        schoolId: next.schoolId,
        settings: next.settings,
        items: next.items,
        rules: next.rules,
        loading: false,
      });
    });
    return () => {
      active = false;
    };
  }, []);

  const currency = state.settings["currency"] ?? {};
  const code = String(currency["code"] ?? "GHS");
  const symbol = String(currency["symbol"] ?? currencySymbol(code));
  const locale = String(currency["locale"] ?? "en-GH");
  const decimals = Number(currency["decimal_places"] ?? 2);

  return {
    ...state,
    symbol,
    options: (listKey, fallback) => optionsFrom(state.items, listKey, fallback),
    money: (amount) => {
      const n = Number(amount ?? 0);
      const formatted = n.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return `${symbol}${formatted}`;
    },
    documentNumber: (sectionKey, sequence, schoolCode = "") => {
      const t = numberingTemplate(sectionKey, state.settings[sectionKey]);
      if (!t) return null;
      return formatNumber({ format: t.format, schoolCode, yearDigits: 2, sequenceDigits: t.sequenceDigits, sequence });
    },
  };
}
