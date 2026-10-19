import { schoolCodeDigits } from "@/lib/numbering";
import { addDays, format, isValid, parseISO } from "date-fns";

export const EMPLOYMENT_TYPES = ["Permanent", "Contract", "Temporary", "Part-time"] as const;
/** Employment types are configured in People Configuration; these are the defaults. */
export type EmploymentType = string;
export const NOTICE_MONTHS = 1;
export const ACCEPTANCE_DAYS = 10;

export function letterDate(value: string) {
  const date = parseISO(value.slice(0, 10));
  return isValid(date) ? format(date, "dd-MM-yyyy") : "—";
}

export function acceptanceDeadline(onboardedAt: string, days: number = ACCEPTANCE_DAYS) {
  const date = parseISO(onboardedAt.slice(0, 10));
  return isValid(date) ? format(addDays(date, days), "dd-MM-yyyy") : "—";
}

export interface ReferenceNumbering { schoolCode: string; yearDigits: number; sequenceDigits: number }

/** APPT/EMP|OFR/{SCHOOL}/{YY}/{SEQ} from the school's configured employee numbering. */
export function offerReference(kind: "account" | "offer", numbering: ReferenceNumbering, sequence: number, issuedAt: string) {
  const code = schoolCodeDigits(numbering.schoolCode);
  const year = String(parseISO(issuedAt.slice(0, 10)).getFullYear() || new Date().getFullYear());
  const yy = numbering.yearDigits > 0 ? year.slice(-numbering.yearDigits) : "";
  const seq = String(sequence).padStart(numbering.sequenceDigits, "0");
  return ["APPT", kind === "account" ? "EMP" : "OFR", code, yy, seq].filter(Boolean).join("/");
}

export function hasContractRenewal(type: EmploymentType) {
  return type.toLowerCase() === "contract";
}

export function eligibleForOffer(role: string) {
  return role === "staff" || role === "school_manager";
}