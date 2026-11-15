import { z } from "zod";
const skills = z
  .array(z.string().trim().min(1).max(40))
  .max(30)
  .transform((x) => [...new Set(x)]);
const weekly = z
  .array(
    z
      .object({
        day: z.number().int().min(1).max(7),
        start: z.number().int().min(0).max(1439),
        end: z.number().int().min(1).max(1440),
      })
      .strict(),
  )
  .max(21)
  .refine((xs) => xs.every((x) => x.start < x.end), "工作時段無效。");
export const rosterProfile = z
  .object({
    branchIds: z.array(z.uuid()).max(50),
    skills,
    timeZone: z
      .string()
      .max(100)
      .refine((x) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: x });
          return true;
        } catch {
          return false;
        }
      }),
    rosterEnabled: z.boolean(),
    weekly,
    leavePeriods: z
      .array(
        z
          .object({
            from: z.iso.datetime({ offset: true }),
            to: z.iso.datetime({ offset: true }),
          })
          .strict()
          .refine(
            (x) => Date.parse(x.from) < Date.parse(x.to),
            "休假結束時間要較後。",
          ),
      )
      .max(100),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (x) => !x.rosterEnabled || x.weekly.length > 0,
    "請先填寫至少一個值班時段。",
  );
const command = { commandId: z.uuid() };
export const rosterAction = z.discriminatedUnion("action", [
  z
    .object({
      ...command,
      action: z.literal("branch"),
      id: z.uuid(),
      name: z.string().trim().min(1).max(80),
      active: z.boolean(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("member"),
      userId: z.uuid(),
      ...rosterProfile.shape,
    })
    .strict(),
  z
    .object({
      ...command,
      action: z.literal("requirement"),
      provider: z.enum(["whatsapp", "meta"]),
      threadId: z.uuid(),
      branchId: z.uuid().nullable(),
      skills,
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type RosterProfile = z.infer<typeof rosterProfile>;
export type RosterPage = {
  canManage: boolean;
  branches: { id: string; name: string; active: boolean; revision: number }[];
  members: { id: string; name: string; profile: RosterProfile }[];
  requirement: { branchId: string | null; skills: string[]; revision: number };
};
