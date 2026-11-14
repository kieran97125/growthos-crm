import { z } from "zod";
export const editorAction = z
  .object({
    provider: z.enum(["whatsapp", "meta"]),
    threadId: z.uuid(),
    token: z.uuid(),
    mode: z.enum(["read", "acquire", "heartbeat", "takeover", "release"]),
    revision: z.number().int().nonnegative().optional(),
  })
  .strict();
export type EditorState = {
  held: boolean;
  occupied: boolean;
  actorName: string | null;
  revision: number;
  expiresAt: string | null;
};
