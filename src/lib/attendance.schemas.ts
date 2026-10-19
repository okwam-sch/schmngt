import { z } from "zod";

export const ATTENDANCE_STATUSES = ["Present", "Absent", "Late", "Excused"] as const;

export const registerQuerySchema = z.object({
  className: z.string().min(1, "Select a class."),
  date: z.string().min(1, "Select a date."),
});

export const saveAttendanceSchema = z.object({
  className: z.string().min(1),
  date: z.string().min(1),
  entries: z
    .array(
      z.object({
        admissionId: z.string().uuid(),
        status: z.enum(ATTENDANCE_STATUSES),
        note: z.string().max(300).optional(),
      }),
    )
    .min(1, "There are no students to mark."),
});

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
