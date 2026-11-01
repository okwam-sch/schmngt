# Multi-Tenancy Security & Architecture Audit — October 2026

Scope: entire project — frontend routes/components, 109 server functions across 13
files, Supabase migrations (supabase/migrations + drizzle/migrations), RLS policies,
security-definer functions, storage policies, background jobs. Method: read-only source
and migration audit by three parallel investigators, then targeted remediation.

## 1. Actual tenant and identity model (baseline)

- Identity: `profiles.id` → `auth.users.id`. One global `profiles.role`; global
  `user_roles(user_id, role)`. **No user-to-school membership or ownership exists.**
- Schools: `schools` has no owner column. `tenant_settings`, `school_branding`,
  `numbering_settings`, `school_classes`, `subjects`, `finance_*` config tables carry
  `school_id`; **all operational tables (admissions, student_*, finance_income/expenses/
  payroll, offer_letters, staff_*, teaching_assignments, class_teachers, audit_logs) do
  not.**
- Tenant context: `resolveProvisionedSchool` (src/lib/school.server.ts) returns the
  earliest active school globally — a single-tenant resolver, not a per-user context.
- School selectors exist only as screen-local state in configuration pages; there is no
  app-wide active-school switching.
- Auth: `requireSupabaseAuth` verifies the bearer token only; role checks are global
  (`assertAdmin` = super_admin OR school_manager, no school dimension).

**Conclusion: the application is architecturally single-tenant** (one school per
deployment) with multi-school *configuration* support. True per-school tenant isolation
(membership table, school_id on operational tables, school-scoped RLS, active-school
switching) is a redesign, not a patch. The remediation below fixes every confirmed
*privilege* and *over-broad access* failure that is exploitable in the current model.

## 2. Findings and remediation status

### Critical — privilege escalation (FIXED this audit)

| # | Finding | Fix |
|---|---|---|
| C1 | `adminResetPassword`: any School Manager could reset a Super Admin's password (service-role, no target check) | New `assertCanManageAccount` guard (src/lib/admin.server.ts): only a Super Admin may modify an account holding an administrator role. Applied to `adminResetPassword`. |
| C2 | `resolveResetRequest`: manager could approve a reset for a Super Admin's email | Same guard applied on the approve path. |
| C3 | `updateAccount`: checked the *new* role, not the *existing* target — a manager could edit/demote a Super Admin | Guard applied before any write. |
| C4 | `setAccountStatus`: manager could suspend a Super Admin | Guard applied. |

### High — over-broad data access (FIXED this audit)

| # | Finding | Fix |
|---|---|---|
| H1 | RLS: any staff could read ALL `student_performance` (`O OR T`) | Policy now requires a teaching assignment for the student (`private.staff_teaches_admission`). |
| H2 | RLS: any staff could insert/update/read ALL `student_assessments` | Same teaching-assignment scoping on insert/update/select. |
| H3 | RLS: any staff could manage ALL `student_exeat` | Same scoping. |
| H4 | `getFinanceConfiguration` accepted an arbitrary school ID from any authenticated user | Now requires administrator role (`assertAdmin`). |

### High — architectural, documented (NOT fixed; requires product decision)

| # | Finding | Status |
|---|---|---|
| A1 | `school_manager` is a *global* admin in RLS (`private.is_admin` has no school argument). With multiple schools, a manager of one school can read/modify all schools' data. | Open — needs a school-membership model (see §3). Safe today only because deployments run one school. |
| A2 | Operational tables have no `school_id`; class-name matching (`staff_teaches_class`) is not school-qualified. Two schools with a class "Form 1" would collide. | Open — same dependency. |
| A3 | School config tables (`school_classes`, `subjects`, `tenant_settings`, `finance_config_*`, `teaching_assignments`, `class_teachers`, `schools`) are readable by all authenticated users (`USING true`). | Open — low sensitivity (configuration, not personal data), but should be scoped with the membership model. |
| A4 | `runInitialSetup` is public; first-comer creates the Super Admin. Gate is "no super admin exists", not atomic. | Open — acceptable for single-deployment bootstrap; restrict after setup. |
| A5 | Attendance handlers rely on RLS rather than handler-level assertions (RLS does enforce class scoping). | Accepted — defense in depth could be added. |

## 3. Required ownership model (per directive) — recommendation

The directive requires one Super Admin owning schools A/B/C with strict per-school
context. The smallest secure change supporting that is:

1. New `school_memberships(user_id, school_id, role)` table (roles stay off profiles;
   per-school roles live here), with RLS and a `has_membership(user, school)` definer.
2. Add `school_id` (NOT NULL, backfilled to the provisioned school) to operational
   tables; rewrite `is_admin`-based policies to membership-scoped policies.
3. Replace `resolveProvisionedSchool` with `resolveActiveSchool(userId, requestedId)`
   that validates membership; thread an explicit active-school selector through the
   portal shell; super-admin global operations stay explicitly role-gated and audited.

This is a multi-day migration and was **not** undertaken in this audit pass; the current
deployment operates one school, so A1–A3 are latent, not live, exposures.

## 4. Verification evidence

- New tests: `src/test/account-guard.test.ts` (4 tests: manager blocked from admin
  target, manager allowed on staff target, super admin unrestricted, any admin role
  counts as privileged).
- Full suite: `bunx vitest run` — **17 files, 70 tests, all pass** (2026-11-01).
- Build: OK (build-errors.log, 2026-11-01T03:10:55Z).
- Migration applied live: staff policies on student_performance / student_assessments /
  student_exeat now teaching-assignment-scoped. Linter: 5 pre-existing warnings
  (security-definer function execution grants, leaked-password protection off) —
  unrelated to this change, not addressed.

## 5. Limitations

- No live authenticated end-to-end tests: the project's Supabase is externally managed,
  so no managed browser session exists. Fixes are verified by unit tests, source
  inspection, and successful migration application — not by clicking through as a
  manager attempting takeover.
- Deployed-policy parity assumed from migrations; a live `pg_policies` dump would
  confirm no drift between drizzle/migrations and supabase/migrations history.
- Storage: the `branding` bucket is publicly readable (avatars included); current UI
  stores data URLs instead, so the bucket is unused. Revisit if storage is adopted.
