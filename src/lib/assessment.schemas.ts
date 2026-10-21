import { z } from "zod";

/** Assessment types are configured in Academic Configuration (academic rules). */

export const assessmentInputSchema = z.object({
  id: z.string().uuid().optional(),
  createId: z.string().uuid().optional(),
  admissionId: z.string().uuid({ message: "Select a student." }),
  className: z.string().trim().min(1, "Select the class.").max(80),
  term: z.string().min(1, "Enter the term.").max(60),
  subject: z.string().min(1, "Enter the subject.").max(80),
  assessmentType: z.string().trim().min(1, "Select the assessment type.").max(40),
  score: z.number().min(0, "Score cannot be negative."),
  outOf: z.number().positive("Out of must be greater than zero."),
  remark: z.string().max(300).default(""),
});

export const assessmentIdSchema = z.object({ id: z.string().uuid() });

/** Every read is explicitly selected and bounded; no school-wide assessment scan. */
export const assessmentSelectionSchema = z.object({
  className: z.string().trim().min(1, "Select a class.").max(80),
  subject: z.string().trim().min(1, "Select a subject.").max(80),
  term: z.string().trim().min(1, "Select a period.").max(60),
  admissionId: z.string().uuid().optional(),
});
export const assessmentPageSchema = assessmentSelectionSchema.extend({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(1000).default(100),
});
export type AssessmentSelection = z.infer<typeof assessmentSelectionSchema>;

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;
