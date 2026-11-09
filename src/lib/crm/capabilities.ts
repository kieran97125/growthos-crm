export type Capability = {
  id: string;
  name: string;
  phase: string;
  state: "available" | "partial" | "blocked" | "planned";
  summary: string;
  next: string;
  acceptance: string;
  source?: string;
  href?: string;
};
export const capabilityStates = {
  available: "操作層可用",
  partial: "已有部分基礎",
  blocked: "待接駁／驗證",
  planned: "已排入產品計劃",
};
export const capabilities: Capability[] = [
  {
    id: "CRM-001",
    name: "客戶與品牌權限",
    phase: "P0 · 執行基礎",
    state: "blocked",
    summary: "現有管理員入口未提供個別用戶與租戶權限。",
    next: "建立會員、角色、品牌授權；所有讀寫由伺服器解析範圍。",
    acceptance:
      "不同客戶、品牌及客服嘅越權讀寫測試全部通過；不能只信任畫面傳入嘅範圍。",
  },
  {
    id: "CRM-002",
    name: "業務收件匣與跟進佇列",
    phase: "P1 · 客服工作台",
    state: "partial",
    summary:
      "搜尋、來源／狀態／品牌／負責人篩選、到期跟進已連動。仍然係查詢紀錄，並非多渠道訊息收件匣。",
    next: "接入標準化 Conversation／Message 模型、已讀與未回覆狀態。",
    acceptance: "新訊息、分派、已讀及結束對話喺多用戶之間保持一致。",
    source: "https://www.omnichat.ai/hk/customer-service",
    href: "/crm",
  },
  {
    id: "CRM-003",
    name: "獨立 WhatsApp 渠道",
    phase: "P0 · 執行基礎",
    state: "blocked",
    summary: "尚未接通獨立 WhatsApp 收發，現有客戶渠道維持原有安排。",
    next: "確認資產擁有者、接駁方式及受權範圍，再驗證測試號碼。",
    acceptance:
      "以獨立測試號碼收到、回覆及驗證 provider 回執；不改現有客戶號碼。",
    source: "https://www.omnichat.ai/hk/whatsapp-business-api/",
    href: "/crm/settings",
  },
  {
    id: "CRM-004",
    name: "訊息收發與回執",
    phase: "P0 · 執行基礎",
    state: "planned",
    summary: "Webhook、媒體、送達／已讀／失敗回執需要獨立傳輸層。",
    next: "簽章驗證、事件去重、durable inbox/outbox、重試及死信處理。",
    acceptance: "重播同一事件不產生重複訊息；延遲回執不令狀態倒退。",
  },
  {
    id: "CRM-005",
    name: "Customer 360 與跨渠道身份",
    phase: "P1 · 客服工作台",
    state: "partial",
    summary: "已有查詢詳情、來源、預約及互動紀錄；跨渠道身份尚未整合。",
    next: "分開 Contact、Channel Identity、Lead、Conversation；合併要有證據同還原路徑。",
    acceptance: "同名不自動合併、跨品牌不混合身份；歷史來源同預約全部保留。",
    source:
      "https://docs.omnichat.ai/features/she-qun-ke-hu-zi-liao-ping-tai/gu-ke-dang-an-social-cdp-fang-an",
  },
  {
    id: "CRM-006",
    name: "分派、備註與協作",
    phase: "P1 · 客服工作台",
    state: "partial",
    summary: "已有受寫入開關控制嘅分派、內部備註同跟進任務。",
    next: "加入個別用戶、團隊、接手衝突檢查、內部提及與分派紀錄。",
    acceptance: "同時接手不覆蓋他人操作；內部備註永遠不當作客戶訊息。",
    source: "https://www.omnichat.ai/hk/customer-service",
  },
  {
    id: "CRM-007",
    name: "預存回覆與個人化草稿",
    phase: "P1 · 客服工作台",
    state: "partial",
    summary: "客戶詳情已有可編輯草稿、姓名／療程變數同複製操作。",
    next: "加入品牌與角色範圍、分類、版本、媒體及受權管理。",
    acceptance: "未填變數會提示；只可讀取及使用獲授權品牌嘅回覆。",
    source: "https://docs.omnichat.ai/features/ke-fu-she-ding/yu-cun-hui-fu",
    href: "/crm",
  },
  {
    id: "CRM-008",
    name: "標籤、自訂屬性與受眾包",
    phase: "P2 · 分眾行銷",
    state: "partial",
    summary: "現有來源／階段篩選可作名單預演；持久標籤及受眾包未實作。",
    next: "獨立標籤定義、貼標事件、有效期、AND／OR 條件及受眾快照。",
    acceptance: "身份標籤與當前階段分開；貼標不能改寫歷史預約或報表。",
    source:
      "https://docs.omnichat.ai/features/she-qun-ke-hu-zi-liao-ping-tai/biao-qian",
    href: "/crm/campaigns",
  },
  {
    id: "CRM-009",
    name: "同意、退訂與聯絡限制",
    phase: "P0 · 執行基礎",
    state: "blocked",
    summary: "現有查詢紀錄無法證明行銷同意，預演會明確排除。",
    next: "品牌與用途獨立嘅同意證據、退訂名單、頻次與時段政策。",
    acceptance:
      "退訂優先於同意；匯入電話、曾經查詢及已預約都不能自動代表行銷同意。",
  },
  {
    id: "CRM-010",
    name: "推播預演與正式執行",
    phase: "P2 · 分眾行銷",
    state: "partial",
    summary: "已提供名單去重、逐位排除原因同發送資格預演。未提供正式發送。",
    next: "固定名單快照、範本同步、批准、發送工作佇列及最後一刻資格重查。",
    acceptance:
      "批准後新增嘅退訂都會被擋；重試不重複發送；完整保留 provider 回執。",
    source: "https://docs.omnichat.ai/features/tui-bo/she-ding-xin-tui-bo",
    href: "/crm/campaigns",
  },
  {
    id: "CRM-011",
    name: "跟進規則模擬",
    phase: "P2 · 流程自動化",
    state: "partial",
    summary: "已可按單一品牌、階段、療程篩選並預演下一次跟進建議。",
    next: "持久規則、版本、事件觸發及延遲工作；以人工審閱決定啟用。",
    acceptance: "模擬不改原有跟進／預約；正式任務可取消、重試、去重及稽核。",
    source: "https://www.omnichat.ai/hk/customer-journey/",
    href: "/crm/automations",
  },
  {
    id: "CRM-012",
    name: "視覺化聊天與顧客旅程",
    phase: "P3 · 流程自動化",
    state: "planned",
    summary: "目標涵蓋觸發、條件分支、等待、標籤、轉人工與訊息節點。",
    next: "以 @xyflow/react 建圖，獨立驗證圖結構及可持續執行嘅工作引擎。",
    acceptance:
      "處理循環、孤立節點、版本升級、暫停及待執行任務；頁面關閉後流程仍可完成。",
    source: "https://www.omnichat.ai/hk/chatbot/",
  },
  {
    id: "CRM-013",
    name: "知識庫 AI 客服",
    phase: "P3 · AI 客服",
    state: "blocked",
    summary: "未接 AI 引擎；現有預存回覆明確標示為人工編寫。",
    next: "品牌知識版本、引用、檢索、回答範圍、人工接手、模型用量與費用上限。",
    acceptance:
      "無知識依據就轉人工；人工接手即停自動回覆；跨品牌檢索隔離、廣東話測試集與費用測試通過。",
    source: "https://docs.omnichat.ai/features/omni-ai-jia-gou-gong-neng",
  },
  {
    id: "CRM-014",
    name: "預約與到店結果",
    phase: "P1 · 客服工作台",
    state: "partial",
    summary: "已有預約與個別結果操作；仍需產品原生嘅一致事件模型。",
    next: "分開預約意向、確認、改期、取消、到店與未到店，保留事件日期同負責人。",
    acceptance:
      "客戶答應不等於預約已確認；當前狀態不能覆蓋過往 Book／Show 歷史。",
  },
  {
    id: "CRM-015",
    name: "客服與行銷成效",
    phase: "P3 · 經營分析",
    state: "planned",
    summary: "目標係回覆 SLA、分派負荷、推播回覆率到 Book／Show／收入歸因。",
    next: "先定義事件、分母、時區、觀察窗同來源信心，再建立共同報表層。",
    acceptance:
      "Sent／Delivered／Read／Replied／Booked／Showed 各有證據；相關唔當作因果，未知值不顯示為 0。",
    source: "https://www.omnichat.ai/hk/customer-service",
  },
  {
    id: "CRM-016",
    name: "多渠道、媒體與行動操作",
    phase: "P3 · 渠道擴展",
    state: "planned",
    summary: "WhatsApp 穩定後加入 Instagram／Messenger／網站訊息及檔案。",
    next: "以渠道 adapter 宣告各自能力；媒體走受權儲存、到期連結與檔案驗證。",
    acceptance:
      "渠道回覆時限獨立驗證，手機可完成同一跟進流程，內部資料不外洩。",
    source: "https://www.omnichat.ai/hk/customer-service",
  },
  {
    id: "CRM-017",
    name: "稽核、工作復原與資料治理",
    phase: "P0 · 執行基礎",
    state: "partial",
    summary: "已有互動及狀態歷史，但未形成正式不可覆寫嘅執行紀錄。",
    next: "工作 idempotency、版本鎖、失敗復原、資料保留、匯出及刪除政策。",
    acceptance:
      "每次分派、合併、排程、批准與外發可追溯；故障復原不破壞原有資料。",
  },
  {
    id: "CRM-018",
    name: "OMO、優惠券與電商擴展",
    phase: "P4 · 可選擴展",
    state: "planned",
    summary: "Omnichat 包含分店導購、優惠券及電商能力；按客戶用途選擇開啟。",
    next: "獨立擴展契約同品牌設定；美容預約核心不依賴電商。",
    acceptance: "停用擴展不影響收件匣／預約；付款只接受伺服器核實結果。",
    source: "https://www.omnichat.ai/hk/whatsapp-business-api/",
  },
];
