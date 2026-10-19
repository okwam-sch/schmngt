import { z } from "zod";

/** Assessment types are configured in Academic Configuration (academic rules). */

export const assessmentInputSchema = z.object({
  id: z.string().uuid().optional(),
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

export type AssessmentInput = z.infer<typeof assessmentInputSchema>;
