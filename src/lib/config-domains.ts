/* ------------------------------------------------------------------ *
 * Configuration domains: the single registry that splits settings into
 * six domains, each governing a set of modules. Modules read settings
 * from their domain; no module owns configuration of its own.
 * ------------------------------------------------------------------ */

import { MODULES, type ModuleCategory } from "@/lib/access";

export type ConfigDomainId =
  | "system-configuration"
  | "academic-configuration"
  | "people-configuration"
  | "operations-configuration"
  | "financial-configuration"
  | "reporting-configuration";

export type DomainStatus = "live" | "partial" | "planned";

export interface ConfigDomain {
  id: ConfigDomainId;
  name: string;
  responsibility: string;
  /** Module ids governed. "*" = platform-wide (all modules). */
  governs: string[] | "*";
  status: DomainStatus;
  /** Settings groups the domain will own once refactored. */
  sections: { title: string; summary: string; liveIn?: ConfigDomainId }[];
  stage: number;
}

export const CONFIG_DOMAINS: ConfigDomain[] = [
  {
    id: "system-configuration",
    name: "System & Platform Configuration",
    responsibility:
      "Platform-wide policies, tenant settings, master data, security and feature availability.",
    governs: "*",
    status: "live",
    stage: 1,
    sections: [
      { title: "Schools & tenants", summary: "School provisioning, types, education levels." },
      { title: "Master data", summary: "Subjects, classes, positions, departments." },
      { title: "Branding & locale", summary: "Display name, colours, language and locale." },
      { title: "Security & features", summary: "Module switches, security policy, school code and employee numbering." },
    ],
  },
  {
    id: "academic-configuration",
    name: "Academic Configuration",
    responsibility:
      "Academic calendars, grading, assessments, examinations, reporting and timetabling rules.",
    governs: ["attendance", "exams-quizzes", "assessment", "results", "termly-reports", "timetable", "performance-tracker"],
    status: "live",
    stage: 2,
    sections: [
      { title: "Academic calendar", summary: "Terms/semesters and lifecycle." },
      { title: "Grading & grade bands", summary: "Grading system, year start and grade bands." },
      { title: "Assessment rules", summary: "Continuous assessment and exam split." },
      { title: "Attendance rules", summary: "Register cut-offs and absence thresholds." },
      { title: "Timetable rules", summary: "Periods, breaks and schedule types." },
      { title: "Report card rules", summary: "Comments, signatures and promotion rules." },
    ],
  },
  {
    id: "people-configuration",
    name: "People Configuration",
    responsibility:
      "Student and staff lifecycle rules, relationships, identity verification and access policies.",
    governs: ["students", "staff-management", "parent-communication", "user-management", "user-verification", "my-children"],
    status: "live",
    stage: 3,
    sections: [
      { title: "Staff lifecycle", summary: "Positions, departments, schedule types and appointment letter terms." },
      { title: "Student lifecycle", summary: "Promotion, transfer and withdrawal rules." },
      { title: "Guardian relationships", summary: "Relationship types and contact rules." },
      { title: "Identity & access", summary: "Verification checks and default access levels." },
    ],
  },
  {
    id: "operations-configuration",
    name: "Operations Configuration",
    responsibility: "Admissions processes, library policies and messaging channels.",
    governs: ["admissions", "library", "messaging", "dashboard"],
    status: "live",
    stage: 4,
    sections: [
      { title: "Admissions process", summary: "Application steps, required documents, numbering." },
      { title: "Library policies", summary: "Loan periods, limits and fines." },
      { title: "Messaging channels", summary: "Announcement audiences and channels." },
    ],
  },
  {
    id: "financial-configuration",
    name: "Financial Configuration",
    responsibility:
      "Billing policies, financial controls, payment rules, receivables, expenses and accounting.",
    governs: ["fees-invoicing", "invoices", "financial-management"],
    status: "live",
    stage: 5,
    sections: [
      { title: "Currency & billing", summary: "Currency (sole owner), fee structures, invoices and payment rules; dates come from the academic calendar." },
      { title: "Payroll & budgets", summary: "Payroll, budgets and financial controls." },
    ],
  },
  {
    id: "reporting-configuration",
    name: "Reporting & Records Configuration",
    responsibility: "Reporting definitions, retention policies, archival rules and data access.",
    governs: ["advanced-reporting", "archives"],
    status: "live",
    stage: 6,
    sections: [
      { title: "Report definitions", summary: "Saved reports, categories, KPIs and dashboards." },
      { title: "Archive & retention", summary: "Archive, retention and restoration rules used by Archives." },
      { title: "Data access", summary: "Who may view and export historical records." },
    ],
  },
];

export const CONFIG_DOMAIN_IDS = CONFIG_DOMAINS.map((d) => d.id) as string[];

export const isConfigDomain = (id: string): id is ConfigDomainId => CONFIG_DOMAIN_IDS.includes(id);

export const getConfigDomain = (id: string) => CONFIG_DOMAINS.find((d) => d.id === id);

/** The one domain (other than platform-wide) that governs a module. */
export function domainForModule(moduleId: string): ConfigDomain | undefined {
  return CONFIG_DOMAINS.find((d) => d.governs !== "*" && d.governs.includes(moduleId));
}

export const CONFIG_CATEGORY: ModuleCategory = "Administration";

/** Operational modules every domain must cover (config pages themselves excluded). */
export const governedModuleIds = () =>
  MODULES.map((m) => m.id).filter((id) => !isConfigDomain(id));
