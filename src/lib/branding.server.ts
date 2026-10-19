export type Branding = {
  name: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  establishedYear: string;
  motto: string;
  language: string;
};
export const FALLBACK_BRANDING: Branding = {
  name: "School Management Portal",
  tagline: "",
  logoUrl: null,
  primaryColor: "",
  accentColor: "",
  establishedYear: "",
  motto: "",
  language: "en",
};

/** Reads the public branding through the narrow get_public_branding_full() database function. */
export async function readBranding(client: any): Promise<Branding> {
  const { data, error } = await client.rpc("get_public_branding_full");
  if (error) { console.error("get_public_branding_full failed", error.message); return FALLBACK_BRANDING; }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    name: row?.name?.trim() || FALLBACK_BRANDING.name,
    tagline: row?.tagline ?? "",
    logoUrl: row?.logo_url ?? null,
    primaryColor: row?.primary_color ?? "",
    accentColor: row?.accent_color ?? "",
    establishedYear: row?.established_year ?? "",
    motto: row?.motto ?? "",
    language: row?.language ?? "en",
  };
}
