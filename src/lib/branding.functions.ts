import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { createClient } from "@supabase/supabase-js";
import { readBranding, type Branding } from "./branding.server";

export const DEFAULT_SCHOOL_NAME = "School Management Portal";
export type PublicBranding = Branding;

/** Public: only name, tagline and logo — nothing else from the school record. */
export const getPublicBranding = createServerFn({ method: "GET" }).handler(async (): Promise<PublicBranding> => {
  const url = process.env["SUPABASE_URL"]!;
  const key = (process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"])!;
  const client = createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const h = new Headers(init?.headers);
      if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
      h.set("apikey", key);
      return fetch(input, { ...init, headers: h });
    } },
  });
  return readBranding(client);
});

export const brandingQueryOptions = queryOptions({
  queryKey: ["branding"],
  queryFn: () => getPublicBranding(),
  staleTime: 5 * 60_000,
});

/** Builds a page title from the router context's branding. */
export function brandTitle(page: string, ctx: { branding?: PublicBranding | undefined } | undefined) {
  return `${page} — ${ctx?.branding?.name || DEFAULT_SCHOOL_NAME}`;
}
