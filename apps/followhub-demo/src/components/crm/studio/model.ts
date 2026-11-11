import { z } from "zod";

export const STUDIO_STORAGE = "followhub:flow-bot-studio:v1";
export const STUDIO_CLIENT = "followhub-demo-only";
export const kinds = [
  "trigger",
  "intent",
  "condition",
  "answer",
  "form",
  "followup",
  "review",
  "reminder",
  "handoff",
  "message",
  "delay",
  "end",
] as const;
export type Kind = (typeof kinds)[number];
export const NODE_META: Record<
  Kind,
  { title: string; description: string; tone: string }
> = {
  trigger: {
    title: "觸發事件",
    description: "收到訊息或預約跟進更新",
    tone: "green",
  },
  intent: {
    title: "辨識客戶需要",
    description: "一般查詢、預約意向、真人協助",
    tone: "violet",
  },
  condition: {
    title: "新客／現客分流",
    description: "按客戶類型選擇下一步",
    tone: "amber",
  },
  answer: {
    title: "知識庫回覆",
    description: "只引用有效、已核准資料",
    tone: "violet",
  },
  form: {
    title: "收集預約意向",
    description: "療程、分店、心儀日期及時間",
    tone: "blue",
  },
  followup: {
    title: "建立跟進卡",
    description: "整理資料，等候同事核實",
    tone: "blue",
  },
  review: {
    title: "CS 核實預約",
    description: "由同事確認，再繼續流程",
    tone: "amber",
  },
  reminder: {
    title: "範本預約提醒",
    description: "自動填入資料，預覽提醒",
    tone: "green",
  },
  handoff: {
    title: "真人接手",
    description: "暫停 BOT，附上交接摘要",
    tone: "rose",
  },
  message: {
    title: "發送文字",
    description: "客服窗口內嘅固定回覆",
    tone: "blue",
  },
  delay: {
    title: "等待及跟進",
    description: "設定稍後處理嘅時間",
    tone: "amber",
  },
  end: { title: "結束流程", description: "保留完整處理記錄", tone: "gray" },
};
const bindingSchema = z.object({
  placeholder: z.string().min(1).max(50),
  field: z.enum(["name", "service", "fee", "date", "time", "branch"]),
});
export const nodeSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(kinds),
  title: z.string().min(1).max(60),
  description: z.string().max(200),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  config: z.object({
    message: z.string().max(2000),
    owner: z.enum(["me", "iris", "ken"]),
    waitHours: z.number().min(1).max(168),
    reminderHour: z.number().int().min(8).max(21),
    template: z.string().max(2000),
    bindings: z.array(bindingSchema).max(12),
  }),
});
const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable(),
});
export const flowSchema = z.object({
  id: z.string().min(1),
  clientId: z.literal(STUDIO_CLIENT),
  brandId: z.enum(["nova-studio", "nova-care"]),
  name: z.string().min(1).max(80),
  description: z.string().max(200),
  nodes: z.array(nodeSchema).max(60),
  edges: z.array(edgeSchema).max(100),
  revision: z.number().int().min(1),
  updatedAt: z.number(),
});
export const articleSchema = z.object({
  id: z.string().min(1),
  clientId: z.literal(STUDIO_CLIENT),
  brandId: z.enum(["nova-studio", "nova-care"]),
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  keywords: z.array(z.string().min(1).max(50)).max(20),
  source: z.string().min(1).max(120),
  status: z.enum(["approved", "draft"]),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  revision: z.number().int().min(1),
});
export const botSchema = z.object({
  brandId: z.enum(["nova-studio", "nova-care"]),
  name: z.string().min(1).max(60),
  mode: z.enum(["assist", "afterhours", "bounded"]),
  tone: z.enum(["friendly", "professional"]),
  greeting: z.string().max(1000),
  allowService: z.boolean(),
  allowLocation: z.boolean(),
  allowHours: z.boolean(),
  openingHour: z.number().int().min(0).max(23),
  closingHour: z.number().int().min(1).max(24),
});
export const studioSchema = z
  .object({
    version: z.literal(1),
    flows: z.array(flowSchema).min(1).max(12),
    versions: z
      .array(
        z.object({ id: z.string(), savedAt: z.number(), flow: flowSchema }),
      )
      .max(30),
    bots: z.array(botSchema).length(2),
    articles: z.array(articleSchema).max(100),
  })
  .superRefine((s, ctx) => {
    if (
      new Set(s.flows.map((f) => f.id)).size !== s.flows.length ||
      new Set(s.articles.map((a) => a.id)).size !== s.articles.length ||
      new Set(s.bots.map((b) => b.brandId)).size !== s.bots.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate studio identity" });
    for (const f of [...s.flows, ...s.versions.map((v) => v.flow)]) {
      const ids = new Set(f.nodes.map((n) => n.id));
      if (
        ids.size !== f.nodes.length ||
        f.edges.some((e) => !ids.has(e.source) || !ids.has(e.target))
      )
        ctx.addIssue({ code: "custom", message: "Invalid graph reference" });
    }
    if (s.bots.some((b) => b.openingHour >= b.closingHour))
      ctx.addIssue({ code: "custom", message: "Invalid reception hours" });
  });
export type StudioState = z.infer<typeof studioSchema>;
export type Flow = z.infer<typeof flowSchema>;
export type FlowNode = z.infer<typeof nodeSchema>;
export type FlowEdge = z.infer<typeof edgeSchema>;
export type BotProfile = z.infer<typeof botSchema>;
export type Article = z.infer<typeof articleSchema>;
export type BrandId = Flow["brandId"];
export type StudioAction =
  | { type: "flow"; flow: Flow }
  | { type: "add-flow"; flow: Flow }
  | { type: "save-version"; flowId: string; at: number; id: string }
  | { type: "restore-version"; versionId: string; at: number }
  | { type: "bot"; bot: BotProfile }
  | { type: "article"; article: Article }
  | { type: "reset" };

export function makeNode(
  kind: Kind,
  id: string,
  x: number,
  y: number,
): FlowNode {
  return {
    id,
    kind,
    title: NODE_META[kind].title,
    description: NODE_META[kind].description,
    position: { x, y },
    config: {
      message: "你好，收到你嘅查詢，我哋會安排同事跟進。",
      owner: "iris",
      waitHours: 3,
      reminderHour: 10,
      template:
        "你好 {{name}}，提醒你已預約 {{service}}。\n日期：{{date}} {{time}}\n分店：{{branch}}\n已核實費用安排：{{fee}}\n如需改期，請回覆我哋。",
      bindings: ["name", "service", "date", "time", "branch", "fee"].map(
        (field) => ({
          placeholder: field,
          field: field as
            "name" | "service" | "date" | "time" | "branch" | "fee",
        }),
      ),
    },
  };
}
function makeFlow(): Flow {
  const nodes = [
    makeNode("trigger", "start", 250, 0),
    makeNode("intent", "intent", 250, 116),
    makeNode("answer", "faq", 0, 260),
    makeNode("form", "intake", 250, 260),
    makeNode("handoff", "human", 500, 260),
    makeNode("followup", "card", 250, 400),
    makeNode("review", "review", 500, 400),
    makeNode("reminder", "remind", 500, 540),
  ];
  const edge = (
    source: string,
    target: string,
    sourceHandle: string | null = null,
  ): FlowEdge => ({
    id: `${source}-${sourceHandle ?? "next"}-${target}`,
    source,
    target,
    sourceHandle,
  });
  return {
    id: "consultation",
    clientId: STUDIO_CLIENT,
    brandId: "nova-studio",
    name: "查詢接待與預約跟進",
    description: "由客戶查詢開始，收集意向，再由同事核實及安排提醒。",
    nodes,
    edges: [
      edge("start", "intent"),
      edge("intent", "faq", "faq"),
      edge("intent", "intake", "booking"),
      edge("intent", "human", "handoff"),
      edge("intake", "card"),
      edge("card", "review"),
      edge("review", "remind"),
    ],
    revision: 1,
    updatedAt: 0,
  };
}
export function createStudioState(): StudioState {
  const flow = makeFlow();
  const reminder: Flow = {
    ...flow,
    id: "appointment-reminder",
    name: "已核實預約・前一日提醒",
    description: "只處理已由同事核實嘅跟進記錄。",
    nodes: [
      makeNode("trigger", "r-start", 250, 50),
      makeNode("review", "r-review", 250, 200),
      makeNode("reminder", "r-remind", 250, 350),
    ],
    edges: [
      { id: "r-1", source: "r-start", target: "r-review", sourceHandle: null },
      { id: "r-2", source: "r-review", target: "r-remind", sourceHandle: null },
    ],
  };
  const article = (
    brandId: BrandId,
    suffix: string,
    title: string,
    content: string,
    keywords: string[],
    status: Article["status"] = "approved",
  ): Article => ({
    id: `${brandId}-${suffix}`,
    clientId: STUDIO_CLIENT,
    brandId,
    title,
    content,
    keywords,
    source: "示範品牌服務手冊",
    status,
    validUntil: "2027-12-31",
    revision: 1,
  });
  return {
    version: 1,
    flows: [flow, reminder],
    versions: [],
    bots: ["nova-studio", "nova-care"].map((brandId) => ({
      brandId: brandId as BrandId,
      name: brandId === "nova-studio" ? "Nova 接待助手" : "Nova Care 助手",
      mode: "assist",
      tone: "friendly",
      greeting: "你好，我係接待助手，可以幫你了解服務同收集預約意向。",
      allowService: true,
      allowLocation: true,
      allowHours: true,
      openingHour: 10,
      closingHour: 19,
    })),
    articles: [
      article(
        "nova-studio",
        "service",
        "舒緩護理・服務與收費",
        "舒緩護理大約需時 60 分鐘，示範收費為 HK$480。首次到店會先了解你嘅需要，再由同事講解流程。預約時間需要同事核實後確認。",
        ["護理", "療程", "收費", "幾錢", "服務", "乾", "price"],
      ),
      article(
        "nova-studio",
        "location",
        "分店與到店指引",
        "Nova Studio 有中環示範店及九龍示範店。確定預約分店後，同事會提供完整到店指引。",
        ["地址", "分店", "邊度", "位置", "location"],
      ),
      article(
        "nova-studio",
        "hours",
        "營業及接待時間",
        "示範接待時間為每日 10:00 至 19:00（香港時間）。非接待時間可以先留下查詢及心儀預約時段，同事上班後會跟進。",
        ["營業", "幾點", "開門", "時間", "hours"],
      ),
      article(
        "nova-studio",
        "draft",
        "新服務介紹・待審核",
        "呢項資料仍然等待管理員核實，不能用作自動回覆。",
        ["全新服務"],
        "draft",
      ),
      article(
        "nova-care",
        "service",
        "肩頸舒緩・服務與收費",
        "Nova Care 肩頸舒緩服務大約 45 分鐘，示範收費 HK$620。具體安排由同事確認。",
        ["肩頸", "服務", "幾錢", "收費", "price"],
      ),
      article(
        "nova-care",
        "location",
        "Nova Care 到店指引",
        "Nova Care 於九龍示範空間提供服務，同事確認安排後會發送完整指引。",
        ["地址", "分店", "邊度", "位置", "location"],
      ),
    ],
  };
}
export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  if (action.type === "reset") return createStudioState();
  if (action.type === "add-flow") {
    const parsed = flowSchema.safeParse(action.flow);
    if (
      !parsed.success ||
      state.flows.length >= 12 ||
      state.flows.some((f) => f.id === parsed.data.id)
    )
      return state;
    return { ...state, flows: [...state.flows, parsed.data] };
  }
  if (action.type === "flow") {
    const parsed = flowSchema.safeParse(action.flow);
    if (!parsed.success) return state;
    return {
      ...state,
      flows: state.flows.map((f) =>
        f.id === parsed.data.id && f.clientId === parsed.data.clientId
          ? parsed.data
          : f,
      ),
    };
  }
  if (action.type === "bot") {
    const parsed = botSchema.safeParse(action.bot);
    if (!parsed.success || parsed.data.openingHour >= parsed.data.closingHour)
      return state;
    return {
      ...state,
      bots: state.bots.map((b) =>
        b.brandId === parsed.data.brandId ? parsed.data : b,
      ),
    };
  }
  if (action.type === "article") {
    const parsed = articleSchema.safeParse(action.article);
    if (!parsed.success) return state;
    const previous = state.articles.find((a) => a.id === parsed.data.id);
    if (previous && previous.brandId !== parsed.data.brandId) return state;
    if (!previous && state.articles.length >= 100) return state;
    return {
      ...state,
      articles: [
        ...state.articles.filter((a) => a.id !== parsed.data.id),
        parsed.data,
      ],
    };
  }
  if (action.type === "save-version") {
    const flow = state.flows.find((f) => f.id === action.flowId);
    if (!flow || state.versions.some((v) => v.id === action.id)) return state;
    const snapshot = structuredClone(flow);
    return {
      ...state,
      versions: [
        { id: action.id, savedAt: action.at, flow: snapshot },
        ...state.versions,
      ].slice(0, 30),
      flows: state.flows.map((f) =>
        f.id === flow.id
          ? { ...f, revision: f.revision + 1, updatedAt: action.at }
          : f,
      ),
    };
  }
  if (action.type === "restore-version") {
    const version = state.versions.find((v) => v.id === action.versionId);
    if (!version) return state;
    const current = state.flows.find((f) => f.id === version.flow.id);
    if (!current) return state;
    return {
      ...state,
      flows: state.flows.map((f) =>
        f.id === current.id
          ? {
              ...structuredClone(version.flow),
              revision: current.revision + 1,
              updatedAt: action.at,
            }
          : f,
      ),
    };
  }
  return state;
}
