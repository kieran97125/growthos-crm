import { z } from "zod";

const text = z.string().max(12000);
const id = z.string().min(1).max(100);
const contactSchema = z.object({
  id,
  clientId: id,
  name: z.string().min(1).max(80),
  initials: z.string().max(4),
  phone: z.string().max(40),
  email: z.string().max(160),
  company: z.string().max(100),
  tags: z.array(z.string().min(1).max(30)).max(20),
  source: z.string().max(100),
  createdAt: z.number(),
  note: text,
});
const conversationSchema = z.object({
  id,
  clientId: id,
  brandId: id,
  contactId: id,
  channel: z.enum(["whatsapp", "instagram", "messenger"]),
  status: z.enum(["open", "snoozed", "resolved"]),
  owner: z.enum(["me", "iris", "ken"]).nullable(),
  priority: z.boolean(),
  pinned: z.boolean(),
  unread: z.number().int().min(0).max(100),
  snoozedUntil: z.number().nullable(),
  subject: z.string().max(100),
  updatedAt: z.number(),
});
const messageSchema = z.object({
  id,
  conversationId: id,
  kind: z.enum(["incoming", "outgoing", "note", "event"]),
  body: text,
  author: z.string().max(80),
  at: z.number(),
  replyTo: id.nullable(),
});
const bookingSchema = z.object({
  id,
  conversationId: id,
  contactId: id,
  service: z.string().min(1).max(100),
  branch: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  fee: z.string().max(100).optional(),
  guests: z.number().int().min(1).max(10),
  customerConfirmed: z.boolean(),
  status: z.enum(["pending", "confirmed", "cancelled"]),
});
export const stateSchema = z
  .object({
    version: z.literal(2),
    contacts: z.array(contactSchema).max(100),
    conversations: z.array(conversationSchema).max(100),
    messages: z.array(messageSchema).max(3000),
    bookings: z.array(bookingSchema).max(100),
  })
  .superRefine((state, ctx) => {
    const contacts = new Map(state.contacts.map((c) => [c.id, c]));
    const conversations = new Map(state.conversations.map((c) => [c.id, c]));
    const messages = new Map(state.messages.map((m) => [m.id, m]));
    const unique = [
      state.contacts,
      state.conversations,
      state.messages,
      state.bookings,
    ].every((rows) => new Set(rows.map((r) => r.id)).size === rows.length);
    const scopes =
      state.contacts.every((c) => c.clientId === DEMO_CLIENT) &&
      state.conversations.every(
        (c) =>
          c.clientId === DEMO_CLIENT &&
          BRANDS.some((b) => b.id === c.brandId) &&
          contacts.get(c.contactId)?.clientId === c.clientId,
      );
    const references =
      state.messages.every(
        (m) =>
          conversations.has(m.conversationId) &&
          (!m.replyTo ||
            messages.get(m.replyTo)?.conversationId === m.conversationId),
      ) &&
      state.bookings.every(
        (b) => conversations.get(b.conversationId)?.contactId === b.contactId,
      );
    if (!unique || !scopes || !references)
      ctx.addIssue({
        code: "custom",
        message: "Invalid demo identity or scope",
      });
  });
export type DemoState = z.infer<typeof stateSchema>;
export type Contact = DemoState["contacts"][number];
export type Conversation = DemoState["conversations"][number];
export type Message = DemoState["messages"][number];
export type Booking = DemoState["bookings"][number];
export type Queue =
  "all" | "mine" | "unassigned" | "unread" | "snoozed" | "resolved";
export const DEMO_CLIENT = "followhub-demo-only";
export const STORAGE_KEY = "followhub:conversation-demo:v2";
export const BRANDS = [
  { id: "nova-studio", name: "Nova Studio", short: "STUDIO" },
  { id: "nova-care", name: "Nova Care", short: "CARE" },
];
export const TEAM = [
  { id: "me", name: "Mia（我）", initials: "M" },
  { id: "iris", name: "Iris Chan", initials: "I" },
  { id: "ken", name: "Ken Wong", initials: "K" },
] as const;
export const QUEUES: { id: Queue; name: string }[] = [
  { id: "all", name: "所有對話" },
  { id: "mine", name: "由我處理" },
  { id: "unassigned", name: "未分配" },
  { id: "unread", name: "未讀訊息" },
  { id: "snoozed", name: "稍後跟進" },
  { id: "resolved", name: "已結束" },
];
export const QUICK_REPLIES = [
  {
    id: "greeting",
    title: "首次查詢",
    shortcut: "/hello",
    body: "你好 {{name}}，多謝你聯絡 {{brand}}！我是 Mia，很高興幫你。你想了解邊項服務，或者有冇心儀嘅預約時間？",
  },
  {
    id: "booking",
    title: "確認預約意向",
    shortcut: "/booking",
    body: "{{name}}，收到你想預約嘅時段。我哋會先為你查詢兩位同行嘅空檔，確認後再發送正式預約詳情俾你 😊",
  },
  {
    id: "location",
    title: "到店指引",
    shortcut: "/location",
    body: "我哋嘅示範體驗空間位於中環示範店。確認預約後，會再同你分享完整到店指引。如有時間變動，隨時喺呢度通知我哋。",
  },
  {
    id: "followup",
    title: "溫馨跟進",
    shortcut: "/followup",
    body: "你好 {{name}}，想跟進一下之前嘅查詢。你仲有冇其他想了解嘅地方？我可以幫你安排合適嘅服務同時間。",
  },
  {
    id: "thanks",
    title: "完成服務",
    shortcut: "/thanks",
    body: "多謝你今日到訪 {{brand}}！之後有任何問題，隨時喺呢度搵我哋。期待下次再見到你 💜",
  },
];

export function createDemoState(now = Date.now()): DemoState {
  const names = [
    "陳曉晴",
    "Rachel Wong",
    "林子軒",
    "周穎欣",
    "Jason Lee",
    "許嘉敏",
    "Emily Chan",
    "黃樂怡",
    "何俊朗",
    "Sophie Lau",
    "梁嘉欣",
  ];
  const initials = [
    "晴",
    "RW",
    "軒",
    "欣",
    "JL",
    "敏",
    "EC",
    "怡",
    "朗",
    "SL",
    "欣",
  ];
  const subjects = [
    "週末雙人護理預約",
    "想了解舒緩護理",
    "查詢到店路線",
    "改期安排",
    "企業員工體驗",
    "首次體驗查詢",
    "下星期預約",
    "護理後跟進",
    "等候客戶確認",
    "體驗安排完成",
    "到店後感謝",
  ];
  const previews = [
    "想問星期六下晝 3 點，兩位一齊做護理仲有冇位？",
    "皮膚最近比較乾，想了解有咩適合嘅護理。",
    "我搭港鐵過嚟，邊個出口最近？",
    "唔好意思，想將預約改到下星期三。",
    "想幫同事安排一個小組體驗，可以報價嗎？",
    "Hello，想了解第一次體驗嘅流程 😊",
    "好呀，等你幫我確認時間。",
    "做完之後感覺幾好，想問日常護理點做。",
    "我確認行程後再覆你，謝謝！",
    "收到，謝謝你幫我安排！",
    "多謝你今日嘅細心講解，下次再嚟。",
  ];
  const contacts: Contact[] = names.map((name, i) => ({
    id: `p${i + 1}`,
    clientId: DEMO_CLIENT,
    name,
    initials: initials[i],
    phone: `+852 5••• ${String(101 + i).padStart(4, "0")}`,
    email: i === 1 ? "rachel@example.com" : "",
    company: i === 4 ? "示範科技公司" : "",
    tags:
      i === 0
        ? ["新客查詢", "雙人同行"]
        : i === 4
          ? ["企業客戶"]
          : i % 3 === 0
            ? ["VIP 客戶"]
            : ["首次體驗"],
    source:
      i % 3 === 0
        ? "WhatsApp 廣告 · CTWA"
        : i % 3 === 1
          ? "Instagram 個人檔案"
          : "網站查詢",
    createdAt: now - (i + 3) * 86400000,
    note: i === 0 ? "偏好週末下午；今次會同朋友一齊到店。" : "",
  }));
  const conversations: Conversation[] = names.map((_, i) => ({
    id: `c${i + 1}`,
    clientId: DEMO_CLIENT,
    brandId: i === 4 || i === 7 ? "nova-care" : "nova-studio",
    contactId: contacts[i].id,
    channel:
      i === 1 || i === 5 ? "instagram" : i === 4 ? "messenger" : "whatsapp",
    status: i >= 9 ? "resolved" : i >= 7 ? "snoozed" : "open",
    owner:
      i === 0 || i === 2 || i === 5
        ? null
        : i % 3 === 0
          ? "me"
          : i % 2 === 0
            ? "ken"
            : "iris",
    priority: i === 0 || i === 3,
    pinned: i === 0,
    unread: i === 0 ? 2 : i === 1 || i === 3 ? 1 : 0,
    snoozedUntil: i >= 7 && i < 9 ? now + 3600000 : null,
    subject: subjects[i],
    updatedAt: now - i * 420000,
  }));
  const messages: Message[] = conversations.flatMap((c, i) => [
    {
      id: `${c.id}-1`,
      conversationId: c.id,
      kind: "incoming",
      body:
        i === 0
          ? "你好，喺 IG 見到你哋嘅雙人護理介紹，想了解吓。"
          : `你好，想查詢${subjects[i]}。`,
      author: names[i],
      at: c.updatedAt - 2400000,
      replyTo: null,
    },
    {
      id: `${c.id}-2`,
      conversationId: c.id,
      kind: "event",
      body: `對話經 ${c.channel === "whatsapp" ? "WhatsApp" : c.channel === "instagram" ? "Instagram" : "Messenger"} 開始`,
      author: "系統",
      at: c.updatedAt - 2399000,
      replyTo: null,
    },
    {
      id: `${c.id}-3`,
      conversationId: c.id,
      kind: "outgoing",
      body:
        i === 0
          ? "你好曉晴！我係 Mia 😊\n可以呀，我哋有雙人同行安排，護理大約需要 60 分鐘。你哋想預約邊日呢？"
          : "你好！多謝你聯絡我哋，我係 Mia，可以幫你跟進。",
      author: "Mia",
      at: c.updatedAt - 1800000,
      replyTo: null,
    },
    ...(i === 0
      ? [
          {
            id: `${c.id}-4`,
            conversationId: c.id,
            kind: "note" as const,
            body: "由 Instagram 廣告轉入 WhatsApp。兩位同行，先確認同時段空檔，再發預約確認。",
            author: "Iris",
            at: c.updatedAt - 1200000,
            replyTo: null,
          },
        ]
      : []),
    {
      id: `${c.id}-5`,
      conversationId: c.id,
      kind: "incoming",
      body:
        i === 0 ? "我同朋友都係第一次做，想一齊過嚟。" : "我想了解多少少詳情。",
      author: names[i],
      at: c.updatedAt - 900000,
      replyTo: null,
    },
    {
      id: `${c.id}-6`,
      conversationId: c.id,
      kind: "incoming",
      body: previews[i],
      author: names[i],
      at: c.updatedAt,
      replyTo: null,
    },
  ]);
  return {
    version: 2,
    contacts,
    conversations,
    messages,
    bookings: [
      {
        id: "b-c1",
        conversationId: "c1",
        contactId: "p1",
        service: "雙人舒緩護理 · 60 分鐘",
        branch: "中環示範店",
        date: new Date(now + 5 * 86400000).toISOString().slice(0, 10),
        time: "15:00",
        guests: 2,
        customerConfirmed: false,
        status: "pending",
      },
    ],
  };
}

export type Action =
  | { type: "message"; conversationId: string; message: Message }
  | { type: "read"; conversationId: string }
  | {
      type: "assign";
      conversationId: string;
      owner: Conversation["owner"];
      at: number;
      eventId: string;
    }
  | {
      type: "status";
      conversationId: string;
      status: Conversation["status"];
      until?: number;
      at: number;
      eventId: string;
    }
  | { type: "priority" | "pin"; conversationId: string }
  | { type: "contact"; contact: Contact }
  | { type: "booking"; booking: Booking; at: number; eventId: string }
  | { type: "hydrate"; state: DemoState }
  | { type: "reset"; state: DemoState };

export function demoReducer(state: DemoState, action: Action): DemoState {
  if (action.type === "hydrate" || action.type === "reset")
    return stateSchema.parse(action.state);
  if (action.type === "contact")
    return {
      ...state,
      contacts: state.contacts.map((c) =>
        c.id === action.contact.id && c.clientId === action.contact.clientId
          ? action.contact
          : c,
      ),
    };
  const conversationId =
    action.type === "booking"
      ? action.booking.conversationId
      : action.conversationId;
  const conversation = state.conversations.find((c) => c.id === conversationId);
  if (!conversation) return state;
  const patch = (changes: Partial<Conversation>) => ({
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === conversationId ? { ...c, ...changes } : c,
    ),
  });
  const withEvent = (
    next: DemoState,
    body: string,
    at: number,
    eventId: string,
  ) => ({
    ...next,
    messages: [
      ...next.messages,
      {
        id: eventId,
        conversationId,
        kind: "event" as const,
        body,
        author: "系統",
        at,
        replyTo: null,
      },
    ],
  });
  if (action.type === "message") {
    const message = action.message;
    if (
      message.conversationId !== conversationId ||
      !["outgoing", "note", "incoming"].includes(message.kind) ||
      !message.body.trim() ||
      message.body.length > 5000 ||
      state.messages.some((m) => m.id === message.id) ||
      (message.replyTo &&
        !state.messages.some(
          (m) =>
            m.id === message.replyTo && m.conversationId === conversationId,
        ))
    )
      return state;
    const next = patch(
      message.kind === "note"
        ? {}
        : {
            updatedAt: message.at,
            status: "open",
            snoozedUntil: null,
            unread: message.kind === "incoming" ? conversation.unread + 1 : 0,
          },
    );
    return {
      ...next,
      messages: [...next.messages, { ...message, body: message.body.trim() }],
    };
  }
  if (action.type === "read")
    return conversation.unread ? patch({ unread: 0 }) : state;
  if (action.type === "priority")
    return patch({ priority: !conversation.priority });
  if (action.type === "pin") return patch({ pinned: !conversation.pinned });
  if (action.type === "assign")
    return withEvent(
      patch({ owner: action.owner }),
      action.owner
        ? `Mia 將對話分配予 ${TEAM.find((t) => t.id === action.owner)?.name}`
        : "Mia 將對話移回未分配",
      action.at,
      action.eventId,
    );
  if (action.type === "status")
    return withEvent(
      patch({
        status: action.status,
        unread: 0,
        snoozedUntil:
          action.status === "snoozed"
            ? (action.until ?? action.at + 3600000)
            : null,
      }),
      action.status === "resolved"
        ? "Mia 結束了對話"
        : action.status === "snoozed"
          ? "Mia 將對話設為稍後跟進"
          : "Mia 重新開啟對話",
      action.at,
      action.eventId,
    );
  if (action.type === "booking") {
    if (action.booking.contactId !== conversation.contactId) return state;
    const previous = state.bookings.find((b) => b.id === action.booking.id);
    if (previous && previous.conversationId !== conversationId) return state;
    return withEvent(
      {
        ...state,
        bookings: [
          ...state.bookings.filter((b) => b.id !== action.booking.id),
          action.booking,
        ],
      },
      action.booking.status === "confirmed"
        ? "預約已由同事確認"
        : action.booking.status === "cancelled"
          ? "預約已取消，歷史記錄保留"
          : "預約意向已儲存，等候同事確認",
      action.at,
      action.eventId,
    );
  }
  return state;
}
export function matchesQueue(c: Conversation, queue: Queue, now: number) {
  const status =
    c.status === "snoozed" && c.snoozedUntil !== null && c.snoozedUntil <= now
      ? "open"
      : c.status;
  if (queue === "resolved" || queue === "snoozed") return status === queue;
  return (
    status === "open" &&
    (queue === "all" ||
      (queue === "mine" && c.owner === "me") ||
      (queue === "unassigned" && c.owner === null) ||
      (queue === "unread" && c.unread > 0))
  );
}
export function selectConversations(
  state: DemoState,
  filters: {
    queue: Queue;
    query: string;
    brand: string;
    channel: string;
    now: number;
  },
) {
  const query = filters.query.trim().toLocaleLowerCase();
  return state.conversations
    .filter((c) => {
      const contact = state.contacts.find((p) => p.id === c.contactId);
      return (
        matchesQueue(c, filters.queue, filters.now) &&
        (filters.brand === "all" || filters.brand === c.brandId) &&
        (filters.channel === "all" || filters.channel === c.channel) &&
        (!query ||
          [
            contact?.name,
            contact?.phone,
            c.subject,
            ...(contact?.tags ?? []),
            ...state.messages
              .filter(
                (m) =>
                  m.conversationId === c.id &&
                  m.kind !== "note" &&
                  m.kind !== "event",
              )
              .map((m) => m.body),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query))
      );
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    );
}
export function fillReply(
  body: string,
  contact: Contact,
  conversation: Conversation,
) {
  return body
    .replaceAll("{{name}}", contact.name)
    .replaceAll(
      "{{brand}}",
      BRANDS.find((b) => b.id === conversation.brandId)?.name ?? "我哋",
    );
}
export function timeLabel(at: number) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}
export function dateLabel(at: number) {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "short",
    day: "numeric",
  }).format(at);
}

export const channelNames = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};
