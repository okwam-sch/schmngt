import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Search } from "lucide-react";
import { getUserVerificationData } from "@/lib/admin.functions";
import { downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Account {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  role: string;
  access_level: string;
  status: string;
  two_factor_enabled: boolean;
  force_password_change: boolean;
  last_login: string | null;
  created_at: string;
  department: string | null;
  employee_id: string | null;
  admission_number: string | null;
}

type Severity = "error" | "warning";
interface Issue {
  severity: Severity;
  text: string;
}

const GENERIC_USERNAMES = ["admin", "user", "test", "demo", "guest"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 86_400_000;
const STAFF_ROLES = new Set(["teacher", "staff", "school_manager"]);

const roleLabel = (r: string) => r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString() : "Never");

/** All checks for one account — the port of validateUserAccount + integrity + security checks. */
function checkAccount(a: Account, ctx: { roleRows: Map<string, string[]>; rolesReadable: boolean; dupEmails: Set<string>; dupUsernames: Set<string> }): Issue[] {
  const issues: Issue[] = [];
  if (!a.full_name?.trim()) issues.push({ severity: "error", text: "Missing full name" });
  if (!a.email?.trim()) issues.push({ severity: "error", text: "Missing email address" });
  else if (!EMAIL_RE.test(a.email)) issues.push({ severity: "error", text: "Invalid email format" });
  if (a.email && ctx.dupEmails.has(a.email.toLowerCase())) issues.push({ severity: "error", text: "Email shared with another account" });
  if (a.username && ctx.dupUsernames.has(a.username.toLowerCase())) issues.push({ severity: "error", text: "Username shared with another account" });
  if (a.username && GENERIC_USERNAMES.includes(a.username.toLowerCase())) issues.push({ severity: "warning", text: "Generic username" });
  if (ctx.rolesReadable) {
    const rows = ctx.roleRows.get(a.id) ?? [];
    if (rows.length === 0) issues.push({ severity: "error", text: "No role record — permissions may not apply" });
    else if (!rows.includes(a.role)) issues.push({ severity: "error", text: `Profile says ${roleLabel(a.role)}, role record says ${rows.map(roleLabel).join(", ")}` });
  }
  if (STAFF_ROLES.has(a.role) && a.role !== "school_manager" && !a.employee_id) issues.push({ severity: "warning", text: "Staff account without employee ID" });
  if (a.role === "student" && !a.admission_number) issues.push({ severity: "warning", text: "Student account without admission number" });
  if ((a.role === "super_admin" || a.role === "school_manager") && !a.two_factor_enabled)
    issues.push({ severity: "warning", text: "Administrator without two-factor sign-in" });
  if (a.status === "active" && !a.last_login && Date.now() - new Date(a.created_at).getTime() > 30 * DAY)
    issues.push({ severity: "warning", text: "Active for over 30 days but never signed in" });
  return issues;
}

function downloadCSV(rows: (string | number | null | undefined)[][], filename: string) {
  downloadCsv(filename, rows);
}

export function UserVerification() {
  const load = useServerFn(getUserVerificationData);
  const [data, setData] = useState<{ accounts: Account[]; roles: { user_id: string; role: string }[]; rolesReadable: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await load()) as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const report = useMemo(() => {
    if (!data) return null;
    const { accounts } = data;
    const roleRows = new Map<string, string[]>();
    for (const r of data.roles) roleRows.set(r.user_id, [...(roleRows.get(r.user_id) ?? []), r.role]);
    const count = (vals: (string | null)[]) => {
      const m = new Map<string, number>();
      for (const v of vals) if (v) m.set(v.toLowerCase(), (m.get(v.toLowerCase()) ?? 0) + 1);
      return new Set([...m].filter(([, n]) => n > 1).map(([k]) => k));
    };
    const ctx = { roleRows, rolesReadable: data.rolesReadable, dupEmails: count(accounts.map((a) => a.email)), dupUsernames: count(accounts.map((a) => a.username)) };
    const checked = accounts.map((a) => ({ account: a, issues: checkAccount(a, ctx) }));
    const withErrors = checked.filter((c) => c.issues.some((i) => i.severity === "error")).length;
    const withWarnings = checked.filter((c) => c.issues.length > 0 && !c.issues.some((i) => i.severity === "error")).length;
    const orphanRoles = data.roles.filter((r) => !accounts.some((a) => a.id === r.user_id)).length;

    const byRole = new Map<string, number>();
    for (const a of accounts) byRole.set(a.role, (byRole.get(a.role) ?? 0) + 1);
    const now = Date.now();
    const signedIn7 = accounts.filter((a) => a.last_login && now - new Date(a.last_login).getTime() < 7 * DAY).length;
    const signedIn30 = accounts.filter((a) => a.last_login && now - new Date(a.last_login).getTime() < 30 * DAY).length;
    const never = accounts.filter((a) => !a.last_login).length;
    const heat = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(now - (6 - i) * DAY);
      const key = day.toDateString();
      return { label: day.toLocaleDateString(undefined, { weekday: "short" }), count: accounts.filter((a) => a.last_login && new Date(a.last_login).toDateString() === key).length };
    });
    const admins = accounts.filter((a) => a.role === "super_admin" || a.role === "school_manager");
    const twoFa = accounts.length ? Math.round((accounts.filter((a) => a.two_factor_enabled).length / accounts.length) * 100) : 0;
    const clean = accounts.length ? Math.round(((accounts.length - withErrors - withWarnings) / accounts.length) * 100) : 100;
    const activeRate = accounts.length ? Math.round((signedIn30 / accounts.length) * 100) : 0;
    const health = Math.round(clean * 0.5 + twoFa * 0.25 + activeRate * 0.25);

    return { checked, withErrors, withWarnings, orphanRoles, byRole, signedIn7, signedIn30, never, heat, admins, twoFa, clean, activeRate, health, ctx };
  }, [data]);

  if (loading && !data) return <div className="surface p-6 text-sm text-muted-foreground">Checking accounts…</div>;
  if (error) {
    return (
      <div className="surface space-y-3 p-6">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={refresh}>Try again</Button>
      </div>
    );
  }
  if (!data || !report) return null;

  const q = query.trim().toLowerCase();
  const visible = report.checked.filter(
    (c) =>
      (!onlyIssues || c.issues.length > 0) &&
      (!q || [c.account.full_name, c.account.email, c.account.username ?? "", c.account.role].some((v) => v?.toLowerCase().includes(q))),
  );
  const maxHeat = Math.max(1, ...report.heat.map((h) => h.count));

  const exportUsers = () =>
    downloadCSV(
      [
        ["Full name", "Email", "Username", "Role", "Access level", "Status", "Two-factor", "Last sign-in", "Created", "Issues"],
        ...report.checked.map(({ account: a, issues }) => [a.full_name, a.email, a.username, roleLabel(a.role), a.access_level, a.status, a.two_factor_enabled ? "Yes" : "No", a.last_login, a.created_at, issues.map((i) => i.text).join("; ")]),
      ],
      `user-verification-${new Date().toISOString().slice(0, 10)}.csv`,
    );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Accounts" value={data.accounts.length} />
        <Stat label="Passed all checks" value={data.accounts.length - report.withErrors - report.withWarnings} tone="success" />
        <Stat label="With warnings" value={report.withWarnings} tone="warning" />
        <Stat label="With errors" value={report.withErrors} tone="danger" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden /> Re-run checks
        </Button>
        <Button variant="outline" onClick={exportUsers}>
          <Download className="size-4" aria-hidden /> Export to CSV
        </Button>
      </div>

      {!data.rolesReadable && (
        <p className="surface p-4 text-sm text-muted-foreground">
          Role records couldn't be read with your access, so role-mismatch checks were skipped.
        </p>
      )}

      <Tabs defaultValue="accounts">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="accounts">All accounts</TabsTrigger>
          <TabsTrigger value="managers">School managers</TabsTrigger>
          <TabsTrigger value="integrity">Data integrity</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="health">System health</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-60 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input className="pl-9" placeholder="Search name, email, username or role" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Button variant={onlyIssues ? "default" : "outline"} onClick={() => setOnlyIssues((v) => !v)}>
              Only accounts with issues
            </Button>
          </div>
          <AccountList items={visible} />
        </TabsContent>

        <TabsContent value="managers">
          {report.checked.filter((c) => c.account.role === "school_manager").length === 0 ? (
            <Notice tone="danger" title="No school manager accounts found" />
          ) : (
            <AccountList items={report.checked.filter((c) => c.account.role === "school_manager")} />
          )}
        </TabsContent>

        <TabsContent value="integrity" className="space-y-3">
          {(() => {
            const problems = [
              ...report.checked.flatMap((c) => c.issues.filter((i) => i.severity === "error").map((i) => `${c.account.full_name || c.account.email}: ${i.text}`)),
              ...(report.orphanRoles ? [`${report.orphanRoles} role record(s) point to accounts that no longer exist`] : []),
            ];
            return problems.length === 0 ? (
              <Notice tone="success" title="Data integrity check passed" body="Every account has a name, a valid unique email and a matching role record." />
            ) : (
              <Notice tone="danger" title={`${problems.length} data integrity issue(s)`} list={problems} />
            );
          })()}
        </TabsContent>

        <TabsContent value="security" className="space-y-3">
          {(() => {
            const problems = report.checked.flatMap((c) =>
              [
                ...c.issues.filter((i) => i.severity === "warning").map((i) => i.text),
                ...(c.account.force_password_change ? ["Must change password at next sign-in"] : []),
                ...(c.account.status !== "active" ? [`Account is ${c.account.status}`] : []),
              ].map((t) => `${c.account.full_name || c.account.email}: ${t}`),
            );
            return (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Stat label="Two-factor enabled" value={`${report.twoFa}%`} />
                  <Stat label="Administrators" value={report.admins.length} />
                  <Stat label="Admins without two-factor" value={report.admins.filter((a) => !a.two_factor_enabled).length} tone="warning" />
                </div>
                {problems.length === 0 ? (
                  <Notice tone="success" title="Security audit passed" />
                ) : (
                  <Notice tone="warning" title={`${problems.length} security finding(s)`} list={problems} />
                )}
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Signed in, last 7 days" value={report.signedIn7} tone="success" />
            <Stat label="Signed in, last 30 days" value={report.signedIn30} />
            <Stat label="Never signed in" value={report.never} tone="warning" />
          </div>
          <section className="surface p-5">
            <h3 className="mb-4 font-semibold">Sign-ins, last 7 days</h3>
            <div className="grid grid-cols-7 gap-2">
              {report.heat.map((h) => (
                <div key={h.label} className="text-center">
                  <div className="rounded-md bg-primary py-4 text-sm font-semibold text-primary-foreground" style={{ opacity: 0.15 + (h.count / maxHeat) * 0.85 }}>
                    {h.count}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{h.label}</p>
                </div>
              ))}
            </div>
          </section>
          <section className="surface p-5">
            <h3 className="mb-3 font-semibold">Most recent sign-ins</h3>
            <ul className="divide-y text-sm">
              {[...data.accounts]
                .filter((a) => a.last_login)
                .sort((a, b) => (b.last_login ?? "").localeCompare(a.last_login ?? ""))
                .slice(0, 10)
                .map((a) => (
                  <li key={a.id} className="flex justify-between gap-4 py-2">
                    <span>{a.full_name} <span className="text-muted-foreground">· {roleLabel(a.role)}</span></span>
                    <span className="text-muted-foreground">{fmtDate(a.last_login)}</span>
                  </li>
                ))}
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <section className="surface space-y-4 p-5">
            <Meter label="Overall health" value={report.health} />
            <Meter label="Accounts passing all checks" value={report.clean} />
            <Meter label="Two-factor coverage" value={report.twoFa} />
            <Meter label="Active in last 30 days" value={report.activeRate} />
          </section>
          <section className="surface p-5">
            <h3 className="mb-3 font-semibold">Accounts by role</h3>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {[...report.byRole].map(([role, n]) => (
                <li key={role} className="flex justify-between rounded-md border px-3 py-2">
                  <span>{roleLabel(role)}</span>
                  <span className="font-semibold">{n}</span>
                </li>
              ))}
            </ul>
          </section>
          <Notice
            tone="warning"
            title="Recommendations"
            list={[
              ...(report.withErrors ? ["Fix the data integrity errors first — they can stop people signing in or getting the right access."] : []),
              ...(report.admins.some((a) => !a.two_factor_enabled) ? ["Turn on two-factor sign-in for every administrator."] : []),
              ...(report.never ? ["Follow up with accounts that have never signed in, or deactivate them."] : []),
            ].concat(report.withErrors || report.never || report.admins.some((a) => !a.two_factor_enabled) ? [] : ["Nothing to act on right now."])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountList({ items }: { items: { account: Account; issues: Issue[] }[] }) {
  if (items.length === 0) return <p className="surface p-6 text-sm text-muted-foreground">No accounts match.</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map(({ account: a, issues }) => {
        const hasError = issues.some((i) => i.severity === "error");
        return (
          <article key={a.id} className="surface space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{a.full_name || "(no name)"}</p>
                <p className="truncate text-sm text-muted-foreground">{a.email}{a.username ? ` · @${a.username}` : ""}</p>
              </div>
              <Badge variant={hasError ? "destructive" : issues.length ? "secondary" : "outline"}>
                {hasError ? "Errors" : issues.length ? "Warnings" : "Verified"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {roleLabel(a.role)} · {a.status} · Last sign-in: {fmtDate(a.last_login)}
            </p>
            {issues.length > 0 && (
              <ul className="space-y-1 text-sm">
                {issues.map((i) => (
                  <li key={i.text} className={`flex gap-2 ${i.severity === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {i.text}
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "success" | "warning" | "danger" }) {
  const border = tone === "success" ? "border-l-primary" : tone === "warning" ? "border-l-warning" : tone === "danger" ? "border-l-destructive" : "border-l-border";
  return (
    <div className={`surface border-l-4 p-4 ${border}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

function Notice({ tone, title, body, list }: { tone: "success" | "warning" | "danger"; title: string; body?: string; list?: string[] }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  const color = tone === "success" ? "text-primary" : tone === "warning" ? "text-warning" : "text-destructive";
  return (
    <section className="surface p-5">
      <h3 className={`flex items-center gap-2 font-semibold ${color}`}>
        <Icon className="size-5" aria-hidden /> {title}
      </h3>
      {body && <p className="mt-2 text-sm text-muted-foreground">{body}</p>}
      {list && list.length > 0 && (
        <ul className="mt-3 max-h-96 list-disc space-y-1 overflow-auto pl-5 text-sm">
          {list.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
