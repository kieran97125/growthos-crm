import { z } from "zod";
import {
  appReducer,
  appSchema,
  createAppState,
  type AppState,
} from "@/lib/demo/state";
import {
  articleSchema,
  botSchema,
  flowSchema,
} from "@/components/crm/studio/model";
import { campaignSchema } from "@/lib/demo/campaigns";
import {
  AccessError,
  canManage,
  type Actor,
  type CompanyScope,
} from "./identity";

const id = z.string().min(1).max(100),
  at = z.number().finite();
const inboxAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("read"), conversationId: id }),
  z.object({ type: z.enum(["priority", "pin"]), conversationId: id }),
  z.object({
    type: z.literal("assign"),
    conversationId: id,
    owner: id.nullable(),
    at,
    eventId: id,
  }),
  z.object({
    type: z.literal("status"),
    conversationId: id,
    status: z.enum(["open", "snoozed", "resolved"]),
    until: at.optional(),
    at,
    eventId: id,
  }),
  z.object({
    type: z.literal("contact"),
    contact: appSchema.shape.inbox.shape.contacts.element,
  }),
  z.object({
    type: z.literal("booking"),
    booking: appSchema.shape.inbox.shape.bookings.element,
    at,
    eventId: id,
  }),
  z.object({
    type: z.literal("message"),
    conversationId: id,
    message: appSchema.shape.inbox.shape.messages.element,
  }),
]);
const studioAction = z.discriminatedUnion("type", [
  z.object({ type: z.enum(["flow", "add-flow"]), flow: flowSchema }),
  z.object({ type: z.literal("bot"), bot: botSchema }),
  z.object({ type: z.literal("article"), article: articleSchema }),
  z.object({ type: z.literal("save-version"), flowId: id, at, id }),
  z.object({ type: z.literal("restore-version"), versionId: id, at }),
]);
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("inbox"), action: inboxAction }),
  z.object({ type: z.literal("studio"), action: studioAction }),
  z.object({
    type: z.literal("import"),
    brandId: id,
    rows: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          phone: z.string().max(40),
        }),
      )
      .min(1)
      .max(50),
    at,
  }),
  z.object({ type: z.literal("campaign-save"), campaign: campaignSchema }),
  z.object({ type: z.literal("campaign-pause"), id }),
  z.object({
    type: z.literal("consent"),
    contactId: id,
    brandId: id,
    granted: z.boolean(),
    at,
  }),
  z.object({ type: z.literal("active-recipient"), id: id.nullable() }),
]);
export const mutationSchema = z.object({
  revision: z.number().int().nonnegative(),
  commandId: z.uuid(),
  command: commandSchema,
});

export function createCompanyState(scope: CompanyScope): AppState {
  const seed = createAppState(0);
  return appSchema.parse({
    version: 1,
    scope,
    inbox: {
      version: 2,
      contacts: [],
      conversations: [],
      messages: [],
      bookings: [],
    },
    studio: {
      version: 1,
      flows: seed.studio.flows.map((f) => ({
        ...f,
        clientId: scope.companyId,
        brandId: scope.brands[0].id,
        nodes: f.nodes.map((n) => ({
          ...n,
          config: { ...n.config, owner: scope.team[0].id },
        })),
      })),
      versions: [],
      bots: scope.brands.map((b) => ({
        ...seed.studio.bots[0],
        brandId: b.id,
        name: `${b.name} 接待助手`,
        mode: "assist",
      })),
      articles: [],
    },
    broadcasts: {
      templates: [],
      profiles: [],
      campaigns: [],
      recipients: [],
      events: [],
      activeRecipientId: null,
    },
  });
}

/** Commands, never a client-supplied replacement document, cross the server boundary. */
export function applyCompanyCommand(
  state: AppState,
  raw: unknown,
  actor: Actor,
  now = Date.now(),
): AppState {
  if (!state.scope) throw new AccessError("公司資料未完成設定。", 409);
  if (actor.role === "viewer") throw new AccessError("你目前只有檢視權限。");
  const checked = commandSchema.safeParse(raw);
  if (!checked.success)
    throw new AccessError("此操作未啟用或資料不完整，改動未有儲存。", 400);
  const command = checked.data;
  if (
    ["studio", "campaign-save", "campaign-pause", "import"].includes(
      command.type,
    ) &&
    !canManage(actor.role)
  )
    throw new AccessError("此操作需要公司管理員權限。");
  if (command.type === "inbox") {
    const a = command.action;
    if (a.type === "message") {
      if (a.message.kind !== "note")
        throw new AccessError("通訊渠道尚未接通；訊息未有傳送。", 409);
      a.message.author = actor.name;
      a.message.at = now;
    }
    if (
      a.type === "assign" &&
      a.owner &&
      !state.scope.team.some((t) => t.id === a.owner)
    )
      throw new AccessError("負責人不屬於此公司。");
    if ("at" in a) a.at = now;
  }
  if (command.type === "consent" && command.granted)
    throw new AccessError("授予推廣同意前，需要登記可核實嘅同意證據。", 409);
  if (command.type === "import" || command.type === "consent") command.at = now;
  const next = appReducer(state, command, actor.name);
  const parsed = appSchema.parse(next);
  if (parsed.scope?.companyId !== state.scope.companyId)
    throw new AccessError("公司範圍不正確。");
  return parsed;
}
