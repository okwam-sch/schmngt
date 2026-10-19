import { periodOfLabel } from "@/lib/academic-calendar";
/** Termly report card rules — shared by the server builder and the screen. */

/* Grade bands, weights and assessment categories live in academic-rules.ts. */

/** Competition ranking: equal scores share a position (1, 2, 2, 4). */
export function rankOf(score: number, all: number[]) {
  return all.filter((s) => s > score).length + 1;
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? "th");
}

export interface Bill {
  approvedFees: number;
  arrears: number;
  amountDue: number;
  paymentMade: number;
  balance: number;
}

/** Student's bill from Financial Management fee records. */
export function buildBill(
  fees: { term: string; amount_due: number; amount_paid: number; created_at: string }[],
  term: string,
): Bill {
  const inTerm = (f: { term: string }) => periodOfLabel(f.term) === term;
  const current = fees.filter(inTerm);
  const others = fees.filter((f) => !inTerm(f));
  const approvedFees = current.reduce((s, f) => s + Number(f.amount_due), 0);
  const paymentMade = current.reduce((s, f) => s + Number(f.amount_paid), 0);
  const arrears = others.reduce(
    (s, f) => s + Math.max(0, Number(f.amount_due) - Number(f.amount_paid)),
    0,
  );
  const amountDue = approvedFees + arrears;
  return { approvedFees, arrears, amountDue, paymentMade, balance: amountDue - paymentMade };
}
