# Roadmap

## Assessment attachment integration
- [x] Audit attachment and replace eager assessment scans with selected, on-demand roster reads
- [x] Save roster scores through existing authorized assessment functions; share report calculations
- [x] Add selected CSV exports, class-list template and database-backed printable reports; exclude unsafe imports/restores
- [x] Test validation, central weighting and authorization; verify public preview
- [ ] Verify hosted roster save/export/report end to end — blocked: external Supabase has no managed browser test session

## Data Access enforcement
- [x] Renumber configuration areas consecutively and verify shared navigation references
- [x] Centralize validated record visibility and export authorization, including database restrictions and all export controls
- [x] Test permissions, scope isolation, lifecycle, invalid rules and export output; report hosted verification limitations

- [x] Port the uploaded Financial Management page into /portal/financial-management (income, expenses, student fees, payroll, reports, GHS currency)
- [x] School provisioning (System Configuration): add District, Town/Village, Community/Area, Postal Address, GPS address fields
- [x] Staff Management onboarding + User Management new user: load Position and Department from Tenant policy settings
- [x] Staff Management scheduling: load Schedule type from Tenant policy settings
- [x] Port uploaded attendance.html into /portal/attendance
- [x] Admissions list: View action showing full step 1-4 details
- [x] Port uploaded assessment.html into /portal/assessment
- [x] Port termly_report_card.html into /portal/termly-reports (bill from Financial Management, school name on every page)
- [x] Academic calendar as the single lifecycle source for all modules and finance config (one page per area)
- [x] Archives module at /portal/archives
- [x] Restructure uploaded offer-letter template for staff and school managers after onboarding, with preview and print.
- [ ] Verify appointment-letter printing end to end — blocked: needs a real school record (System Configuration); the preview itself now opens for a saved staff record, names the signing administrator and states "No active school is configured" instead of failing.

## Configuration domains (registry: six domains, each module governed by exactly one)
- [x] Stage 0 — Domain registry, four placeholder pages, rename System → System & Platform Configuration
- [ ] Stage 1 — System & Platform: keep schools, master data, branding, security, numbering, module switches; expose a shared read hook other domains consume
- [x] Stage 2 — Academic: move academic calendar + grading/rating scale out of System; add assessment weights, attendance, timetable, report-card rules
- [x] Stage 3 — People: move positions/departments/schedule types + appointment-letter settings; add student lifecycle, guardian, verification rules
- [x] Stage 4 — Operations: admissions (documents, genders, numbering), library policies, messaging channels
- [x] Stage 5 — Financial: reads calendar from Academic; currency owned only by Financial Configuration (branding currency removed, school currency is the starting value only), every amount formatted through useFinanceConfig
- [x] Stage 6 — Reporting & Records: move retention policies out of Financial; add report definitions and data-access rules

## Audit fixes (Oct 2026)
- [x] Single owner for staff lists (People Configuration)
- [x] Versioned, conflict-safe saves for calendar and academic rules
- [x] Shared default brand colours, clearer load errors, calendar tests
- [ ] Tests for finance-config rules and archive state logic
- [x] One shared provisioned-school resolver for overview, finance and archives (school name on every portal page)

## Academic wiring (Oct 2026)
- [x] Assessment types in Academic Configuration, used by Assessment and Termly Reports
- [x] Teaching assignments scope Assessment (classes, subjects, students, server checks)
- [x] "Next term begins" from the following calendar period
- [x] Parent dashboard: real average score and attendance %, per-period summaries, paged lists
- [x] Shared pagination on Assessment, Admissions, Attendance history, Finance tables
- [x] Branding logo: Super Admin uploads logo (no URL); one shared logo component sized per context (pages, dashboards, modules, documents, watermark); logo as default profile picture; branding fields (name, tagline, colours, language) centralized
