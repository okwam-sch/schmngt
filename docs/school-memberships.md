# School memberships: implementation and verification

## Delivered
- Protected memberships assign an account a role, access level and active/suspended status independently for each school. Super Administrator remains a protected platform role.
- Operational tables have school ownership, backfilled to the existing school. Restrictive policies bind reads and writes to the database-authorized school. Composite learner links prevent attaching another school's admission to a child record.
- The per-tab selector is only a preference; middleware forwards it and the database validates active school, identity and membership. Invalid selections fail closed, with a recovery button to clear the preference.
- Portal switching cancels queries, clears caches and reloads the document. Membership administration supports existing accounts and paginated lists.
- Account/admission creation assigns memberships. Shared identity changes are platform-only. Manager account guards also protect school administrator memberships.
- Configuration and branding use the selected school. School creation and starting configuration are transactional.
- Numbering for admissions uses the admission's school. Global profile employment fields and employee identifiers remain shared identity attributes, not independent employment records per school.

## Validation
- Full regression suite: `bunx vitest run` — 78 tests passed across 18 files.
- Added school-resolver tests and manager/shared-identity/membership-role tests.
- Database migration tool applied schema, grants, restrictive policies, helper functions and transactional provisioning; generated types updated automatically.
- Database linter: five pre-existing warnings (two public and two signed-in security-definer execution warnings, plus disabled leaked-password protection). No newly introduced warning remains.
- Preview compilation checked through `/tmp/observability/build-errors.log`.
- Public sign-in page inspected in Chromium; school branding and role choices render. Authenticated switching remains unverified.

## Limitations
- Authenticated two-school browser and hosted RLS end-to-end tests are not available because Supabase is externally managed and no managed browser session can be minted. Unit tests do not establish live RLS correctness.
- Existing installation has one school; no fabricated production schools or accounts were added for testing.
- Profile employment attributes remain global. Use memberships to change per-school access; the account editor intentionally rejects shared identities. Independent multi-school employment contracts need a separate model.
- Some pre-existing operational overview queries remain bounded by Supabase's standard row limit; membership administration itself is paginated. A complete platform-wide scalability redesign is not claimed.
- Changes are in preview; publishing was not requested for this task.