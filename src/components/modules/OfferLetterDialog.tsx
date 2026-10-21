import { LogoWatermark, SchoolLogo } from "@/components/branding/SchoolLogo";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAppointmentLetter } from "@/lib/offer-letter.functions";
import {
  acceptanceDeadline,
  EMPLOYMENT_TYPES,
  hasContractRenewal,
  letterDate,
  NOTICE_MONTHS,
  ACCEPTANCE_DAYS,
  offerReference,
  type EmploymentType,
} from "@/lib/offer-letter";
import { useFinanceConfig } from "@/hooks/useFinanceConfig";
import { printDocument } from "@/lib/print-document";

export type LetterTarget = { id: string; kind: "account" | "offer" };
type LetterData = Awaited<ReturnType<typeof getAppointmentLetter>>;

export function OfferLetterDialog({
  target,
  onClose,
}: {
  target: LetterTarget | null;
  onClose: () => void;
}) {
  const { money: currency } = useFinanceConfig();
  const fetchLetter = useServerFn(getAppointmentLetter);
  const [data, setData] = useState<LetterData | null>(null);
  const [error, setError] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [signerId, setSignerId] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">("");
  const letterRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!target) return;
    let current = true;
    setData(null);
    setError("");
    setEmploymentType("");
    setSchoolId("");
    setSignerId("");
    fetchLetter({ data: target })
      .then((result) => {
        if (!current) return;
        setData(result);
        if (result.schools.length === 1) setSchoolId(result.schools[0]?.id ?? "");
        if (result.signers.length === 1) setSignerId(result.signers[0]?.id ?? "");
      })
      .catch((err: unknown) => {
        if (current) setError(err instanceof Error ? err.message : "Could not load offer letter.");
      });
    return () => {
      current = false;
    };
  }, [target?.id, target?.kind]);

  const school = data?.schools.find((s) => s.id === schoolId);
  const signer = data?.signers.find((s) => s.id === signerId);
  const employee = data?.employee;
  const terms = school?.terms ?? {
    noticeMonths: NOTICE_MONTHS,
    acceptanceDays: ACCEPTANCE_DAYS,
    employmentTypes: [...EMPLOYMENT_TYPES],
  };
  const ready = Boolean(
    school && signer && employmentType && employee?.startDate && employee.salary != null,
  );

  const print = () => {
    if (!letterRef.current || !ready) return;
    printDocument(letterRef.current, "Appointment letter");
  };

  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Appointment offer letter</DialogTitle>
          <DialogDescription>
            {employee?.name ?? "Staff and school manager appointment"}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : !data ? (
          <p role="status">Loading letter…</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>School</Label>
                <Select value={schoolId} onValueChange={setSchoolId}>
                  <SelectTrigger aria-label="Letter school">
                    <SelectValue placeholder="Select school" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Employment type</Label>
                <Select
                  value={employmentType}
                  onValueChange={(value) => setEmploymentType(value as EmploymentType)}
                >
                  <SelectTrigger aria-label="Employment type">
                    <SelectValue placeholder="Select employment type" />
                  </SelectTrigger>
                  <SelectContent>
                    {terms.employmentTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Signing administrator</Label>
                <Select value={signerId} onValueChange={setSignerId}>
                  <SelectTrigger aria-label="Signing administrator">
                    <SelectValue placeholder="Select super administrator" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.signers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!employee?.startDate || employee.salary == null ? (
              <p role="alert" className="text-sm text-destructive">
                Add the employee’s start date and salary before printing.
              </p>
            ) : null}
            {!data.schools.length ? <p role="alert">No active school is configured.</p> : null}
            {!data.signers.length ? (
              <p role="alert">No active super administrator is available to sign.</p>
            ) : null}
            <div className="flex justify-end">
              <Button onClick={print} disabled={!ready}>
                <Printer className="mr-2 size-4" />
                Print / Save PDF
              </Button>
            </div>
            {ready && school && signer && employee && target && employmentType ? (
              <article
                ref={letterRef}
                className="appointment-letter"
                style={{ position: "relative" }}
                aria-label="Appointment letter"
              >
                <LogoWatermark />
                <header className="appointment-letter-head">
                  <div>
                    <p>In replying, please quote this reference and date.</p>
                    <p className="mt-3">
                      <strong>My Ref. No.:</strong>
                      <br />
                      {offerReference(
                        target.kind,
                        school.numbering,
                        school.sequence,
                        employee.onboardedAt,
                      )}
                    </p>
                    <p className="mt-2">Your Ref. No.: __________________</p>
                  </div>
                  <SchoolLogo size="document" className="appointment-emblem" />
                  <div>
                    <h2>{school.name}</h2>
                    <p>GHANA EDUCATION SERVICE</p>
                    {school.postal_address ? <p>{school.postal_address}</p> : null}
                    <p>
                      {[school.community, school.town, school.district, school.region]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {school.gps_address ? <p>GPS: {school.gps_address}</p> : null}
                    <p>Date: {letterDate(employee.onboardedAt)}</p>
                    <p>Email: {signer.email}</p>
                  </div>
                </header>
                <div className="appointment-values">
                  <strong>Our GES Core Values</strong>
                  <p>
                    Professionalism · Collaboration · Equity · Innovation · Excellence · Discipline
                    · Integrity
                  </p>
                </div>
                <p>
                  <strong>{employee.name.toUpperCase()}</strong>
                  <br />
                  {employee.email}
                  {employee.employeeId ? (
                    <>
                      <br />
                      Employee ID: {employee.employeeId}
                    </>
                  ) : null}
                </p>
                <h3>
                  OFFER OF A {employmentType.toUpperCase()} APPOINTMENT AS{" "}
                  {employee.role === "School Manager"
                    ? "SCHOOL MANAGER"
                    : (employee.position || "STAFF").toUpperCase()}
                </h3>
                <p>
                  I am pleased to inform you that Management of {school.name} has decided to offer
                  you a{" "}
                  <strong>
                    {employmentType.toLowerCase()} appointment as{" "}
                    {employee.role === "School Manager"
                      ? "School Manager"
                      : employee.position || "Staff"}
                    {employee.role === "School Manager" &&
                    employee.position &&
                    employee.position !== "School Manager"
                      ? ` (${employee.position})`
                      : ""}
                  </strong>
                  , effective <strong>{letterDate(employee.startDate ?? "")}</strong>.
                </p>
                <p>
                  The salary attached to this position on the {school.name} Internally Generated
                  Fund (IGF) salary structure is{" "}
                  <strong>{currency(Number(employee.salary))}</strong>. This is subject to Income
                  Tax and SSNIT deductions.
                </p>
                <p>
                  Your terms and conditions of service shall be subject to the Ghana Education
                  Service code of conduct, and any other general or departmental instructions
                  emanating from this office.
                </p>
                <p>
                  Management may terminate your appointment for unsatisfactory performance by giving{" "}
                  {terms.noticeMonths} month{terms.noticeMonths === 1 ? "" : "s"} written notice. If
                  you decide to resign, you are required to give this office {terms.noticeMonths}{" "}
                  month{terms.noticeMonths === 1 ? "" : "s"} written notice or pay{" "}
                  {terms.noticeMonths} month{terms.noticeMonths === 1 ? "" : "s"} salary in lieu of
                  notice.
                </p>
                {hasContractRenewal(employmentType) ? (
                  <p>
                    This contract appointment may be renewed based on satisfactory performance and
                    conduct, as assessed by Management.
                  </p>
                ) : null}
                <p>
                  If you accept this appointment and its terms, please acknowledge receipt and
                  acceptance in writing to this office on or before{" "}
                  <strong>{acceptanceDeadline(employee.onboardedAt, terms.acceptanceDays)}</strong>.
                  If written acceptance is not received by that date, the offer will be considered
                  withdrawn.
                </p>
                <p>Thank you.</p>
                <div className="appointment-signature">
                  <p>Signature: __________________________</p>
                  <strong>{signer.full_name}</strong>
                  <p>Super Administrator</p>
                  <p>{school.name}</p>
                </div>
                <footer>
                  <strong>CC:</strong>
                  <ol>
                    <li>Super Administrator — {signer.full_name}</li>
                    <li>
                      School Manager{data.managers.length ? ` — ${data.managers.join(", ")}` : ""}
                    </li>
                    <li>Employee — {employee.name}</li>
                  </ol>
                </footer>
              </article>
            ) : null}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
