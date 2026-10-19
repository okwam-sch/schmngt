export const CURRENCY_SYMBOL = "₵";

export const cedis = (n: number | string | null | undefined) =>
  `${CURRENCY_SYMBOL}${Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const INCOME_CATEGORIES = [
  { value: "tuition", label: "Tuition Fees" },
  { value: "donations", label: "Donations" },
  { value: "grants", label: "Government Grants" },
  { value: "sponsorships", label: "Sponsorships" },
  { value: "other", label: "Other Income" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "salaries", label: "Staff Salaries" },
  { value: "utilities", label: "Utilities (Water, Electricity, Internet)" },
  { value: "maintenance", label: "Building Maintenance" },
  { value: "supplies", label: "Educational Supplies" },
  { value: "transport", label: "Transportation" },
  { value: "other", label: "Other Expenses" },
] as const;

export const FEE_TYPES = [
  { value: "tuition", label: "Tuition Fee" },
  { value: "pta", label: "PTA Dues" },
  { value: "classes", label: "Extra Classes Fee" },
  { value: "sports", label: "Sports Fee" },
  { value: "examination", label: "Examination Fee" },
  { value: "other", label: "Other Fee" },
] as const;

export const FEE_STATUSES = ["pending", "paid", "overdue"] as const;
export const INCOME_STATUSES = ["received", "pending"] as const;
export const EXPENSE_STATUSES = ["paid", "pending"] as const;
export const PAYROLL_STATUSES = ["pending", "processed"] as const;

export function categoryLabel(
  list: readonly { value: string; label: string }[],
  value: string,
) {
  return list.find((c) => c.value === value)?.label ?? value;
}

export const today = () => new Date().toISOString().slice(0, 10);
