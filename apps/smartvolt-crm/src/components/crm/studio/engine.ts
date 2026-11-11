import {
  NODE_META,
  type Article,
  type BotProfile,
  type BrandId,
  type Flow,
} from "./model";

export type Intent = "faq" | "booking" | "handoff";
export function detectIntent(message: string): Intent {
  if (
    /退款|投訴|真人|人工|經理|醫生|懷孕|發炎|refund|complaint|human/i.test(
      message,
    )
  )
    return "handoff";
  if (/預約|改期|有冇位|空位|星期|book|appointment|reserve/i.test(message))
    return "booking";
  return "faq";
}
export type AssistantResult = {
  engine?: "ai" | "demo" | "policy";
  model?: string;
  decision: "draft" | "auto-demo" | "handoff" | "blocked";
  intent: Intent;
  reply: string;
  reason: string;
  summary: string;
  sources: { id: string; title: string; revision: number; source: string }[];
  missing: string[];
};
export function suggestReply(input: {
  message: string;
  name: string;
  brandId: BrandId;
  profile: BotProfile;
  articles: Article[];
  now: number;
  withinWindow: boolean;
  humanOwned: boolean;
  businessHours: boolean;
  assist?: boolean;
}): AssistantResult {
  const intent = detectIntent(input.message);
  const base: AssistantResult = {
    decision: "draft",
    intent,
    reply: "",
    reason: "",
    summary: `客戶 ${input.name || "未提供稱呼"}：${input.message.slice(0, 180)}`,
    sources: [],
    missing: [],
  };
  if (input.profile.brandId !== input.brandId)
    return {
      ...base,
      decision: "blocked",
      reason: "品牌範圍不一致，停止處理。",
    };
  if (!input.assist && input.humanOwned)
    return {
      ...base,
      decision: "blocked",
      reason: "真人已接管，BOT 暫停回覆。",
    };
  if (!input.withinWindow)
    return {
      ...base,
      decision: "blocked",
      reason: "已超出客服窗口，請選擇可用嘅核准範本。",
    };
  if (intent === "handoff")
    return {
      ...base,
      decision: "handoff",
      reply: "收到，我會將你嘅查詢交畀同事親自跟進。",
      reason: "涉及真人協助或需要專業核實，交接後暫停自動回覆。",
    };
  if (intent === "booking")
    return {
      ...base,
      decision: "draft",
      reply: `你好${input.name ? " " + input.name : ""}，收到你嘅預約意向。可以話我知想了解邊項服務、心儀分店，同埋日期時間嗎？我哋會交畀同事核實後再確認安排。`,
      reason: "收集預約意向；沒有即時名額資料，正式安排由 CS 核實。",
      missing: ["服務項目", "心儀分店", "日期及時間"],
    };
  const topic = /地址|分店|邊度|位置|location/i.test(input.message)
    ? "location"
    : /營業|幾點|開門|hours/i.test(input.message)
      ? "hours"
      : "service";
  if (
    (topic === "service" && !input.profile.allowService) ||
    (topic === "location" && !input.profile.allowLocation) ||
    (topic === "hours" && !input.profile.allowHours)
  )
    return {
      ...base,
      decision: "handoff",
      reason: "呢類問題未獲授權由 BOT 處理。",
      reply: "收到你嘅查詢，我會請同事幫你確認。",
    };
  const today = new Date(input.now + 8 * 3600000).toISOString().slice(0, 10);
  const article = input.articles
    .filter(
      (a) =>
        a.brandId === input.brandId &&
        a.status === "approved" &&
        a.validUntil >= today &&
        a.keywords.some((k) =>
          input.message.toLowerCase().includes(k.toLowerCase()),
        ),
    )
    .sort(
      (a, b) =>
        b.keywords.filter((k) => input.message.includes(k)).length -
        a.keywords.filter((k) => input.message.includes(k)).length,
    )[0];
  if (!article)
    return {
      ...base,
      decision: "handoff",
      reason: "未找到有效、已核准嘅品牌資料。",
      reply: "呢個問題我想先請同事確認，避免提供唔準確嘅資料。",
    };
  const auto =
    !input.assist &&
    (input.profile.mode === "bounded" ||
      (input.profile.mode === "afterhours" && !input.businessHours));
  const greeting =
    input.profile.tone === "professional"
      ? `你好${input.name ? " " + input.name : ""}。`
      : `你好${input.name ? " " + input.name : ""} 😊 `;
  return {
    ...base,
    decision: auto ? "auto-demo" : "draft",
    reply: greeting + article.content,
    reason: auto
      ? "符合指定回覆範圍及接待設定；本次只模擬回覆。"
      : "已準備建議，等候同事確認後傳送。",
    sources: [
      {
        id: article.id,
        title: article.title,
        revision: article.revision,
        source: article.source,
      },
    ],
  };
}

export function validateFlow(flow: Flow): string[] {
  const issues: string[] = [];
  const nodes = new Map(flow.nodes.map((n) => [n.id, n]));
  if (nodes.size !== flow.nodes.length) issues.push("節點 ID 重複。");
  if (new Set(flow.edges.map((e) => e.id)).size !== flow.edges.length)
    issues.push("連線 ID 重複。");
  const starts = flow.nodes.filter((n) => n.kind === "trigger");
  if (starts.length !== 1) issues.push("流程需要且只可以有一個觸發節點。");
  if (flow.edges.some((e) => !nodes.has(e.source) || !nodes.has(e.target)))
    issues.push("有連線指向不存在嘅節點。");
  const seen = new Set<string>(),
    active = new Set<string>();
  function visit(id: string) {
    if (active.has(id)) {
      issues.push("流程有循環，請移除重複路徑。");
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    active.add(id);
    for (const e of flow.edges.filter((e) => e.source === id)) visit(e.target);
    active.delete(id);
  }
  if (starts[0]) visit(starts[0].id);
  if (flow.nodes.some((n) => !seen.has(n.id)))
    issues.push("有節點未接入主流程。");
  for (const n of flow.nodes) {
    const edges = flow.edges.filter((e) => e.source === n.id);
    const handles = edges.map((e) => e.sourceHandle ?? "next");
    const allowed =
      n.kind === "intent"
        ? ["faq", "booking", "handoff"]
        : n.kind === "condition"
          ? ["new", "existing"]
          : ["answer", "reminder", "handoff", "end"].includes(n.kind)
            ? []
            : ["next"];
    if (handles.some((h) => !allowed.includes(h)))
      issues.push(`${n.title}：連線出口不適用於此節點。`);
    if (n.kind === "trigger" && flow.edges.some((e) => e.target === n.id))
      issues.push(`${n.title}：觸發節點不能接收上一步。`);
    if (new Set(handles).size !== handles.length)
      issues.push(`${n.title}：同一出口只能連接一個節點。`);
    if (
      n.kind === "intent" &&
      ["faq", "booking", "handoff"].some((h) => !handles.includes(h))
    )
      issues.push(`${n.title}：請連接查詢、預約同真人三個分支。`);
    if (
      n.kind === "condition" &&
      ["new", "existing"].some((h) => !handles.includes(h))
    )
      issues.push(`${n.title}：請連接新客及現客兩個分支。`);
    if (
      !["answer", "reminder", "handoff", "end"].includes(n.kind) &&
      !edges.length
    )
      issues.push(`${n.title}：未設定下一步。`);
    if (n.kind === "reminder") {
      const placeholders = [
        ...n.config.template.matchAll(/\{\{(\w+)\}\}/g),
      ].map((m) => m[1]);
      if (!n.config.template.trim()) issues.push(`${n.title}：範本內容未填。`);
      if (
        placeholders.some(
          (p) => !n.config.bindings.some((b) => b.placeholder === p),
        )
      )
        issues.push(`${n.title}：有變數未配對資料欄位。`);
    }
  }
  return [...new Set(issues)];
}
export type SimulationInput = {
  intent: Intent;
  customerType: "new" | "existing";
  manualVerified: boolean;
  consent: boolean;
  templateApproved: boolean;
  withinWindow: boolean;
  fields: {
    name: string;
    service: string;
    fee: string;
    date: string;
    time: string;
    branch: string;
  };
};
export const DEFAULT_SIMULATION: SimulationInput = {
  intent: "booking",
  customerType: "new",
  manualVerified: false,
  consent: true,
  templateApproved: true,
  withinWindow: true,
  fields: {
    name: "陳曉晴",
    service: "舒緩護理",
    fee: "HK$480",
    date: "2026-11-12",
    time: "15:00",
    branch: "中環示範店",
  },
};
export type TraceStep = {
  nodeId: string;
  title: string;
  state: "completed" | "waiting" | "blocked";
  detail: string;
  preview?: string;
};
export type SimulationResult = {
  steps: TraceStep[];
  issues: string[];
  outcome: string;
  followup: boolean;
};
export function simulateFlow(
  flow: Flow,
  input: SimulationInput,
): SimulationResult {
  const issues = validateFlow(flow);
  if (issues.length)
    return { steps: [], issues, outcome: "請先修正流程", followup: false };
  const steps: TraceStep[] = [];
  let node = flow.nodes.find((n) => n.kind === "trigger");
  let verified = false,
    followup = false;
  for (let i = 0; node && i < 60; i++) {
    const n = node;
    let state: TraceStep["state"] = "completed",
      detail = NODE_META[n.kind].description,
      preview: string | undefined;
    if (n.kind === "intent")
      detail = `測試查詢已分流至：${input.intent === "booking" ? "預約意向" : input.intent === "faq" ? "一般查詢" : "真人協助"}`;
    if (n.kind === "condition")
      detail = `客戶類型：${input.customerType === "new" ? "新客" : "現有客戶"}`;
    if (n.kind === "answer") {
      state = input.withinWindow ? "completed" : "blocked";
      detail = input.withinWindow
        ? "知識回覆節點已通過窗口檢查；可到 BOT 試聊驗證品牌知識內容。"
        : "超出客服窗口，知識庫文字回覆暫停，請使用核准範本。";
    }
    if (n.kind === "form")
      detail = "收集心儀療程、分店及時間，只建立意向，未確認名額。";
    if (n.kind === "followup") {
      followup = true;
      detail = "跟進卡已於試跑中建立，狀態：待 CS 核實。";
    }
    if (n.kind === "review") {
      verified = input.manualVerified;
      state = verified ? "completed" : "waiting";
      detail = verified
        ? "測試條件：同事已核實預約資料，可繼續。"
        : "流程停低等候同事核實，未安排客戶提醒。";
    }
    if (n.kind === "handoff") {
      state = "waiting";
      detail = `交接畀 ${n.config.owner === "me" ? "Mia" : n.config.owner === "ken" ? "Ken" : "Iris"}，附對話摘要，BOT 暫停。`;
    }
    if (n.kind === "delay") {
      state = "waiting";
      detail = `試跑停喺等待節點：${n.config.waitHours} 小時後跟進。未建立真實排程。`;
    }
    if (n.kind === "message") {
      preview = n.config.message;
      if (!input.withinWindow) {
        state = "blocked";
        detail = "超出客服窗口，固定文字不可直接發送，請使用核准範本。";
      }
    }
    if (n.kind === "reminder") {
      const missing = n.config.bindings.filter(
        (b) => !input.fields[b.field]?.trim(),
      );
      if (
        !verified ||
        !input.consent ||
        !input.templateApproved ||
        missing.length
      ) {
        state = "blocked";
        detail = !verified
          ? "尚未通過 CS 核實節點。"
          : !input.consent
            ? "未有接收通知同意。"
            : !input.templateApproved
              ? "測試範本未獲批，停止提醒。"
              : `缺少變數資料：${missing.map((b) => b.field).join("、")}`;
      } else {
        preview = n.config.template.replace(
          /\{\{(\w+)\}\}/g,
          (_, p: string) => {
            const binding = n.config.bindings.find((b) => b.placeholder === p);
            return binding ? input.fields[binding.field] : `{{${p}}}`;
          },
        );
        detail = `提醒預覽：預約前一日 ${String(n.config.reminderHour).padStart(2, "0")}:00（香港時間）。未發送至真實渠道。`;
      }
    }
    steps.push({
      nodeId: n.id,
      title: n.title,
      state,
      detail,
      ...(preview ? { preview } : {}),
    });
    if (state !== "completed") break;
    const handle =
      n.kind === "intent"
        ? input.intent
        : n.kind === "condition"
          ? input.customerType
          : null;
    const edge = flow.edges.find(
      (e) => e.source === n.id && (e.sourceHandle ?? null) === handle,
    );
    node = edge ? flow.nodes.find((n) => n.id === edge.target) : undefined;
  }
  const last = steps.at(-1);
  return {
    steps,
    issues: [],
    outcome:
      last?.state === "blocked"
        ? "需要處理"
        : last?.state === "waiting"
          ? "等候下一步"
          : "試跑完成",
    followup,
  };
}
