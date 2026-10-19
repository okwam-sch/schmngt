import { useId } from "react";
import * as React from "react";
import { useSchoolName } from "@/hooks/useSchoolName";
import { cn } from "@/lib/utils";
import { DEFAULT_BRAND_COLORS } from "@/lib/config";

/**
 * The one school logo. Every page, dashboard, module, document and avatar
 * renders it through this component, so size and placement are decided here.
 * Uses the uploaded logo when there is one, otherwise draws the school crest
 * from the configured name, tagline, year and colours.
 */
export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl" | "document";
const SIZE: Record<LogoSize, string> = {
  xs: "size-6",
  sm: "size-9",
  md: "size-12",
  lg: "size-20",
  xl: "size-32",
  document: "size-[22mm]",
};

export interface LogoBrand {
  name: string;
  tagline: string;
  logoUrl: string | null;
  primaryColor?: string;
  accentColor?: string;
  establishedYear?: string;
}

export function SchoolLogo({
  size = "md",
  className,
  brand,
  style,
}: {
  size?: LogoSize;
  className?: string;
  style?: React.CSSProperties;
  /** Override (e.g. the unsaved branding preview); defaults to the saved branding. */
  brand?: LogoBrand;
}) {
  const saved = useSchoolName();
  const b = brand ?? saved;
  const cls = cn("inline-block shrink-0 object-contain", SIZE[size], className);
  if (b.logoUrl) return <img src={b.logoUrl} alt={`${b.name} logo`} className={cls} style={style} />;
  return <SchoolCrest brand={b} className={cls} style={style} compact={size === "xs" || size === "sm"} />;
}

/** Full-page faint watermark for official documents. Place inside a `relative` container. */
export function LogoWatermark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.07, pointerEvents: "none", zIndex: 0 }}
    >
      <SchoolLogo size="xl" className="" style={{ width: "55%", height: "auto", maxWidth: "140mm" }} />
    </div>
  );
}

/** Logo beside the school name and tagline — headers and sign-in. */
export function SchoolLockup({ size = "sm", className, showTagline = true }: { size?: LogoSize; className?: string; showTagline?: boolean }) {
  const b = useSchoolName();
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <SchoolLogo size={size} />
      <div className="min-w-0">
        <p className="truncate font-semibold leading-tight">{b.name}</p>
        {showTagline && b.tagline ? <p className="truncate text-xs text-muted-foreground">{b.tagline}</p> : null}
      </div>
    </div>
  );
}

function SchoolCrest({ brand, className, compact, style }: { brand: LogoBrand; className: string; compact: boolean; style?: React.CSSProperties | undefined }) {
  const id = useId().replace(/:/g, "");
  const primary = brand.primaryColor || DEFAULT_BRAND_COLORS.primary;
  const accent = brand.accentColor || DEFAULT_BRAND_COLORS.accent;
  const initials = brand.name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w) && !/^(of|the|and|&)$/i.test(w))
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const top = brand.name.toUpperCase();
  const bottom = (brand.tagline || "").toUpperCase();
  return (
    <svg viewBox="0 0 200 200" className={className} style={style} role="img" aria-label={`${brand.name} logo`}>
      <defs>
        <path id={`t${id}`} d="M 30 100 A 70 70 0 0 1 170 100" />
        <path id={`b${id}`} d="M 26 100 A 74 74 0 0 0 174 100" />
      </defs>
      <circle cx="100" cy="100" r="98" fill={accent} />
      <circle cx="100" cy="100" r="93" fill={primary} />
      <circle cx="100" cy="100" r="58" fill="#ffffff" />
      {compact ? (
        <text x="100" y="116" textAnchor="middle" fontSize="44" fontWeight="800" fill={primary} fontFamily="inherit">
          {initials || "S"}
        </text>
      ) : (
        <>
          <text fontSize={top.length > 26 ? 11 : 14} fontWeight="700" fill="#ffffff" letterSpacing="1.5" fontFamily="inherit">
            <textPath href={`#t${id}`} startOffset="50%" textAnchor="middle">{top}</textPath>
          </text>
          {bottom ? (
            <text fontSize={bottom.length > 30 ? 9 : 11} fontWeight="700" fill="#ffffff" letterSpacing="1" fontFamily="inherit">
              <textPath href={`#b${id}`} startOffset="50%" textAnchor="middle">{bottom}</textPath>
            </text>
          ) : null}
          <circle cx="16" cy="100" r="4" fill="#ffffff" />
          <circle cx="184" cy="100" r="4" fill="#ffffff" />
          {/* sun */}
          <circle cx="100" cy="86" r="14" fill={accent} />
          {/* open book */}
          <path d="M66 92 Q83 86 99 94 L99 124 Q83 116 66 122 Z" fill={primary} />
          <path d="M134 92 Q117 86 101 94 L101 124 Q117 116 134 122 Z" fill={primary} opacity="0.85" />
          <text x="100" y="78" textAnchor="middle" fontSize="12" fill={primary}>★</text>
          {brand.establishedYear ? (
            <text x="100" y="142" textAnchor="middle" fontSize="9" fontWeight="600" fill={accent} fontFamily="inherit">
              EST. {brand.establishedYear}
            </text>
          ) : (
            <text x="100" y="142" textAnchor="middle" fontSize="12" fontWeight="800" fill={primary} fontFamily="inherit">
              {initials}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
