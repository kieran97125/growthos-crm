# Omnichat → Growth OS CRM 功能拆解與實作記錄

查核日期：2026-11-09（香港時間）。目標產品：獨立 `kieran97125/growthos-crm`。查核基線：`main` / `7f36ad9`。

## 產品目標與證據範圍

目標體驗係由同一個客服工作台，處理「查詢 → 對話 → 分派 → 跟進 → 預約 → 到店 → 成效」，並將行銷分眾、受控推播同知識庫 AI 連成可追溯流程。按租戶及品牌配置，避免每接一個客戶就複製整套程式。

本次根據官方網站、公開教學及目前 CRM 程式碼分析，獨立實作可驗證嘅功能行為。未登入 Omnichat 後台做實際操作驗收，未取得或聲稱取得其私有後端、原始碼、資料庫、內部 API 或完整行為規格。未安裝 REA；網頁 SaaS 嘅公開資料同自身 repo 審核足以支援今次操作層實作。

「官方已核實」表示供應商文件列出功能，唔代表我哋已實測其效能、限制或宣傳中嘅轉化數字。「產品設計」係我哋嘅架構判斷。「本地已實作」只描述本分支，唔表示已上線或已達成全面功能對等。

## 官方功能 → 自家實作對照

| 功能 | 官方已核實 | 本分支／現有程式證據 | 未完成範圍與系統卡 |
|---|---|---|---|
| 統一收件匣 | 多渠道訊息、按處理進度分類、轉移及接手 [S1] | `/crm` 真正連動搜尋、品牌、負責人、來源、階段及跟進佇列 | 現時係 LeadOps 查詢，未有多渠道訊息串流；CRM-002/003/004 |
| 客服協作 | 分派、內部備註、工作量統計 [S1] | 原有受開關控制嘅分派、備註、跟進及預約操作保留 | 個別用戶、權限、同時接手控制及通知；CRM-001/006 |
| 顧客檔案 | 跨渠道客戶、會員資訊、自訂屬性、標籤 [S2] | 原有 lead 詳情整合來源、客戶、預約及互動 | Contact 同多個 Lead／Channel Identity 未分清；CRM-005 |
| 標籤及分眾 | 類別、有效期、貼標人數／次數、時間篩選 [S3] | 來源／階段可組合做受眾預演 | 標籤定義、貼標事件及持久受眾包；CRM-008 |
| 預存回覆 | 分類、適用角色、媒體、姓名參數 [S4] | lead 詳情新增可編輯草稿、姓名／療程帶入、未填變數提示與複製 | 伺服器持久保存、角色與品牌可見範圍、媒體；CRM-007 |
| 推播 | 受眾包、自訂條件、CSV、範本與預覽 [S5] | `/crm/campaigns` 按品牌選取、電話驗證、範圍內去重、逐位排除原因 | 同意證據、完整受眾、批准、工作佇列、實際送達；CRM-009/010 |
| 規則與旅程 | 關鍵字、分派、視覺流程、條件與個人化訊息 [S6/S7] | `/crm/automations` 按現有 lead 條件預演跟進建議，唔改原紀錄 | 尚未按訊息關鍵字觸發；圖形編輯、持久版本、等待／重試；CRM-011/012 |
| AI 客服 | 知識文件、Agent 設定、回答範圍、轉人工及接手停止 [S8] | 未接模型；預存回覆清楚標示人工編寫 | 知識版本、檢索、引用、評測、模型、成本限制及接手；CRM-013 |
| WhatsApp | 團隊收件匣、API、自動化及範本 [S9] | 原有渠道設定頁保留；本分支無 provider 呼叫 | 獨立資產授權、收發、回執、媒體；CRM-003/004/016 |
| 經營分析 | 渠道、等待時間、客服、旅程訊息及轉化統計 [S1/S7] | 本次只提供操作數量及預演結果 | SLA 必須有訊息時間證據；Book／Show／收入採歷史事件；CRM-014/015 |
| OMO／電商 | 分店導購、優惠券、目錄、付款等 [S9] | 作可選擴展記錄 | 不讓美容預約核心依賴電商；CRM-018 |

上述能力拆成 18 張持久系統卡，原始定義喺 `src/lib/crm/capabilities.ts`，可由 `/crm/system` 檢視目前狀態、下一步、完成條件同來源。

## 目前程式審核結論

目前獨立 CRM 係 Next.js／React，提供一個查詢列表、lead 詳情、條件式 Phase 2 操作及渠道設定頁。原有搜尋欄、來源／狀態下拉並無連動。本分支補上實際篩選及 URL 保留，保留原有表格而唔以假對話代替真資料。

現有讀取依賴 server-only service-role client，同埋共用管理員入口；未有個別用戶／租戶權限契約。原 Phase 2 schema 以 brand slug 為主要範圍，唔可以當成已驗證嘅多租戶基礎。未合併舊 `feature/alyssa-crm-operations-port` migration，未套用任何 SQL。正式多租戶執行必須先完成 CRM-001。

所有新操作頁只讀取本月已載入嘅最多 500 筆查詢；畫面顯示呢個限制。佢唔係全量聯絡人名單，亦唔係歷史受眾統計。沒有姓名／電話／對話／範本／價格／分店／憑證由任何現有客戶系統搬過嚟；驗收使用明確合成 fixtures。

## 長期架構（產品設計）

| 層 | 資料與責任 | 關鍵契約 |
|---|---|---|
| 身份與授權 | client、brand、membership、role、brand access | 從受驗證伺服器 session 解析範圍；每個 RPC／資料查詢都要套用，唔信任畫面傳入嘅 ID |
| 客戶與來源 | Contact、Channel Identity、Lead、Source Snapshot | 同名唔合併；明確品牌界線；保留首次／最近／提交來源同證據 |
| 對話 | Conversation、Message、Internal Note、Assignment Event | 內部備註同外發訊息分開；處理權同狀態更新要有版本衝突控制 |
| 渠道 | Provider Adapter、Inbound Event Inbox、Message Outbox、Delivery Event | 簽章、dedupe key、provider message ID、回執單調性；provider-specific 能力不可混為通用能力 |
| 預約與結果 | Booking、Booking Event、Payment Verification、Funnel Event | 當前狀態、預約意向、正式確認同歷史 Book／Show 各自有依據；付款憑證唔等於付款確認 |
| 分眾 | Tag Definition、Tag Application Event、Custom Attribute、Segment Definition | 有效標籤同歷史貼標分開；標籤變動不可改寫歷史預約；AND／OR 條件需要版本 |
| 推播執行 | Consent Event、Suppression、Template Version、Audience Snapshot、Approval、Job | 批准對應固定快照及內容摘要；worker 發送前重新核對同意／排除／範本／權限／頻次，不能只依賴之前預演 |
| 自動化 | Trigger Event、Workflow Version、Run、Step、Retry／Dead Letter | 以事件觸發；延遲工作持久化，瀏覽器關閉都可執行；停止及版本變更有明確語義 |
| AI 與知識 | Knowledge Document／Version／Chunk、Agent Policy、Reply Proposal、Evaluation | 按品牌授權檢索、引用來源、回答界線、轉人工；對話內容唔可以授權 AI 執行任意工具；用量同費用上限 |
| 可觀察與報表 | Audit、Job Attempt、Metric Projection、Attribution Link | 成功、未知、未接駁同失敗分開；訊息／預約／到店／收入各有事件與觀察窗，唔將相關當作因果 |

跨渠道身份即使有相同電話，都唔會無證據跨品牌合併。全租戶 Contact 抽象只可喺獲授權範圍內讀取對應品牌關係。訊息去重亦要包含渠道帳號同 provider ID，唔可只靠電話。

## 本分支已可驗收

1. 收件匣：真實查詢讀模型、組合篩選、電話格式搜尋、到期排序、未指派及未設跟進佇列、重新整理保留 URL 條件。分派／跟進資料不可用時顯示未知，暫停相關篩選；手機採可直接打開客戶詳情嘅卡片，桌面保留操作表格。
2. 回覆草稿：人工預存回覆、受限變數替換、缺少值保留提示、可編輯及複製；唔假裝已有 AI。
3. 受眾預演：明確單一品牌、國際電話 metadata 驗證、同範圍去重、退訂優先及逐位排除。現讀模型缺乏租戶、同意、渠道同範本證據，所以發送資格保持 0。
4. 跟進規則：按 lead 階段同療程篩選，展示建議時間同原時間，只係模擬，唔修改現有 Book／Show 或跟進。
5. 功能藍圖：18 張模組卡，將依賴、缺口、驗收同官方來源放返產品內。

`operations.ts` 係純預演／規則契約，唔係可繞過伺服器授權嘅正式 send admission API。UI 唔包含 live send endpoint、provider token input、外發 worker 或 AI 呼叫。

## 實作次序與必要條件

| 階段 | 交付焦點 | 可進入下一階段嘅條件 |
|---|---|---|
| P0 | CRM-001/003/004/009/017：個別用戶與租戶、獨立測試渠道、入站／外發事件、同意與稽核 | 受權資產、brand access、重播去重、回執、退訂及恢復測試通過 |
| P1 | CRM-002/005/006/007/014：Conversation、Customer 360、協作、預存回覆、預約 | 真訊息同 lead 清楚分開；多人接手、備註、改期、確認及歷史事件驗收 |
| P2 | CRM-008/010/011：持久分眾、批准推播、跟進事件 | 全量受眾、固定快照、發送前重驗、取消、rate cap、idempotency |
| P3 | CRM-012/013/015/016：視覺旅程、AI、成效及新渠道 | 持久工作、知識引用、轉人工、多品牌評測、成本上限及真實報表證據 |
| P4 | CRM-018：OMO／電商 | 按客戶需求選配，核心客服與預約可獨立運行 |

## 專業工具與依賴

今次新增並鎖定：`lucide-react`（統一圖示）、`zod`（篩選／規則驗證）、`libphonenumber-js`（國際號碼驗證）；開發依賴 `tsx`、`@playwright/test`、`@axe-core/playwright` 同 `prettier`，分別提供純規則、完整互動、無障礙檢查同一致格式。沒有因工具未安裝而接受失效控制項。

視覺圖編輯需要 `@xyflow/react`，但要配合獨立 workflow validator 同持久執行引擎，唔會單靠拖拉畫面。AI 階段建議使用 `ai` 及選定供應商嘅 SDK、runtime schema、知識解析／檢索與評測工具；接駁前先確認 provider、資料範圍同費用政策，今次未安裝或呼叫。延遲工作依現有 Growth OS 平台能力選擇受管理嘅 durable queue，避免重複引入調度框架。

## Product Learning Sync checked

已讀 canonical protocol、index 同 checkpoint，並考慮：

- `2026-07-16-crm-priority-a-operations.md`
- `2026-07-16-alyssa-crm-operations-extraction.md`
- `2026-07-17-alyssa-crm-regression-acceptance.md`
- `2026-07-26-whatsapp-broadcast-operations-boundary.md`
- `2026-08-10-permission-aware-aggregate-brand-scope.md`
- `2026-10-06-current-pending-authority-bounded-edits.md`

採用抽象原則：身份與 lead 分開、預約意向同確認分開、CRM 負責最終外發限制、退訂優先、模擬先有明確預演結果、品牌範圍一致、歷史結果同當前工作狀態分開。多品牌平台層同企業特有同步邏輯保留待正式架構審查；沒有將現有客戶 implementation 或 production schema 直接移植。

本次 checkpoint 更新應以 canonical 私有 repo 嘅獨立 review change 記錄；合併前唔視作正式 Core release。

## 驗證與發佈界線

驗證命令：`npm run test:operations`、`npm run typecheck`、`npm run lint`、`npm run test:e2e`、`npm run build`、`npm run verify:production-boundary`。CI 保留合成畫面、trace 同失敗證據。23 個 domain tests 已通過；實際 UI／無障礙結果以本分支最新 CI run 為準，未跑或失敗唔會宣稱通過。

`/crm/acceptance` 只喺 development 加明確測試開關時提供合成資料；production build 即使有人設定該測試開關都應回 404。正式頁面保持現有管理員入口，未提升為多租戶權限保證。沒有正式資料庫 migration、帳號／號碼重新註冊、live send、AI 自動回覆或 production 發佈。回退係還原本分支程式變更，唔涉及資料逆遷移。

## 官方來源

- S1 客服整合、協作、預存回覆及統計：https://www.omnichat.ai/hk/customer-service
- S2 Social CDP 顧客檔案：https://docs.omnichat.ai/features/she-qun-ke-hu-zi-liao-ping-tai/gu-ke-dang-an-social-cdp-fang-an
- S3 標籤：https://docs.omnichat.ai/features/she-qun-ke-hu-zi-liao-ping-tai/biao-qian
- S4 預存回覆：https://docs.omnichat.ai/features/ke-fu-she-ding/yu-cun-hui-fu
- S5 推播：https://docs.omnichat.ai/features/tui-bo/she-ding-xin-tui-bo
- S6 Chatbot：https://www.omnichat.ai/hk/chatbot/
- S7 Customer Journey：https://www.omnichat.ai/hk/customer-journey/
- S8 Omni AI：https://docs.omnichat.ai/features/omni-ai-jia-gou-gong-neng
- S9 WhatsApp API：https://www.omnichat.ai/hk/whatsapp-business-api/

未採用宣傳轉化率作自身預測；功能可用性、訂閱方案、配額及登入後台細節要按獨立測試環境進一步驗收。
