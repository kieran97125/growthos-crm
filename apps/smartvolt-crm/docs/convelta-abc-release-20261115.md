# Convelta ABC 發布驗收記錄

狀態：資料庫已安裝；正式 App 切換待最後驗收，本段不代表已上線。

使用者已授權完成及發布原來 A1–A5、B1–B4、C1–C4。這是共用 CRM 程式能力，仍按產品、角色、品牌及來源權限使用；A5 只處理 Convelta 自身官網查詢。

## 本輪功能

| 工作包 | 已實作能力 | 外部啟用／驗收條件 |
|---|---|---|
| A1 | WhatsApp、Messenger、Instagram 分別顯示接駁、來訊、平台接收及送達證據 | 公司需接通自己的真實渠道；當前零接駁 |
| A2 | 角色、品牌／產品權限、停用／復原及歷史；邀請生命週期程式 | 郵件 sender、Auth redirect 及指定郵箱接受仍待接通 |
| A3 | 持久 outbox、Workflow 睡眠／復原、一次派送 admission、租戶公平掃描、配額及自動訊息總開關 | 私人平台排程需讀回實際執行；不需要 CRON_SECRET |
| A4 | 品牌／渠道／用途同意、證據、退訂及當下發送資格 | 真實同意由公司記錄；匯入電話不當作同意 |
| A5 | 官網來源 ID、保留原資料、排除測試、負責同事、狀態、備註及香港跟進時間 | 已啟用現有唯一 Convelta 品牌；當前零正式查詢、三筆測試排除 |
| B1 | 同步正式已審批文字模板、語言／版本／變數；對話內 UTILITY 範本回覆 | 須自己的已接通 WA、正式模板及服務聯絡同意；媒體／按鈕模板未提供 |
| B2 | 三步推播、分眾、姓名／品牌個人化、香港排程、取消及每收件人結果 | 公司營銷開關、同意、quiet time、頻率及平台資格重檢 |
| B3 | 未回覆、預約前提醒及完成服務後回訪；來源變動／回覆／真人接手即停止；不可變發布版本、每客進度及停止原因 | 需真實渠道與來源紀錄；進階自由 Flow 圖仍明示為設計器，不把畫圖稱為已執行 |
| B4 | App 提醒、去重、延後／完成、安靜時段；關閉 App 後的 C 確定性觀察與來源；裝置訂閱、撤銷及失效處理程式 | VAPID 兩條正式環境密鑰的儲存被自動審核攔截；無嘗試繞過，裝置推播仍停用 |
| C1 | 辦公時間 SLA、真人與自動回覆分開、主管佇列、舊資料未量度覆蓋、每視窗編輯鎖／接手及草稿保留 | 真實量測由新觀測起；不補造歷史零延遲 |
| C2 | 固定分店 ID、技能、每週更表、休假；配合在線／接客上限及公平派客 | 公司按實際團隊設定；不搶走既有負責同事 |
| C3 | 完整聚合後分頁、期間／首次查詢客群、截止時間、確認／到店／核實收款退款、真人表現、推播關聯、成本證據 | 缺歸因／成本如實標示；推播前七日最近接收關聯不代表因果或廣告 ROI |
| C4 | 品牌資產所有權／存取核實、獨立量測同意、加密設定、真實確認／全額付款事件、穩定 ID、測試／正式及接收回執 | 公司自己的 Meta dataset／business／ad account／token 及真實事件驗收；接收不等於匹配或歸因 |

## 驗收與來源

- 本機 340 項程式／資料庫測試通過；原生 PostgreSQL 競爭派客、接客最後一位、編輯／接手、同意及共用配額通過。
- 實際 Workflow 引擎的持久睡眠／醒來及取消 admission 有獨立驗收。
- 上一輪完整瀏覽器 123／126 通過；剩餘三項模板測試已按實際名稱及選項修正，最後一輪結果待讀回。
- 四十張新表均 RLS 且 browser 無 raw table 權限；七十六個相關程序均 invoker、空 search path、browser 不可 execute。
- 工作區 revision 5；inbox/POS/studio/broadcast 指紋與原始 A2 一致。客戶、渠道接駁及外發仍為零；無新邀請或模型請求。
- 安全 WARN 保持原有 own-site definer／password 類別；新服務端表的 RLS-no-policy INFO 不以放開 browser 作修正。兩個新 SLA FK 索引已補齊。
- 本機連接瀏覽器失去原始 context；未把測試 fixture／資料庫 Owner RPC 當作新正式登入畫面驗收。

## 已安裝 SQL 原文

| 平台實際版本／名稱 | 來源與 installed statements MD5 |
|---|---|
| `20261114211854_convelta_engagement_execution` | `04e59639bab64d1ce02b4ab407e300b3` |
| `20261114211900_convelta_customer_journeys` | `9ec9a8e884fd1b6fd45646d0a7ddcb14` |
| `20261114211904_convelta_execution_watchdog` | `4d23d8d7a035a8deca4cc8e6f5391b4a` |
| `20261114211933_convelta_supervision_and_editors` | `4a3fd6eb16d5567a2d106332100ab43b` |
| `20261114211938_convelta_branch_roster` | `cd06ae19bf82594d1655388d7987f0de` |
| `20261114211943_convelta_sales_handoff` | `9ae70a17bca7be9fceae1734ea0b3a49` |
| `20261114211948_convelta_notifications` | `fd7adae557ba93b25304dcc529042941` |
| `20261114212001_convelta_outcomes_reporting` | `0b4378428e11c3722762a4f7588c4aa7` |
| `20261114212006_convelta_meta_feedback` | `01eb84bff19613c79e8fa0def99a62ed` |
| `20261114212011_convelta_abc_audit_indexes` | `e37396fc1ed71eca2b9507fbbb7ad1b5` |
| `20261114212015_convelta_copilot_background` | `ef0b532ff82d49227df4187d2112b7a2` |
| `20261114212247_convelta_sla_history_indexes` | `2b9da4e547b2021d4f692e7fa67ee48f` |
| `20261114214500_convelta_watchdog_cursor_wrap` | `4fc0ebca52a81876bc2859c9ae96d0c7` |

平台實際版本已對齊來源檔名，SQL bytes 不變。十三項依序安裝；其中兩項只補索引，最後一項修正排程巡迴，全部 SQL 原文已核對。

## Product Learning Sync checked

發布前重新查核 protocol `6a80846bfa10af9a4b84304688b19a326d0752b6`、index `1080e9542f7845a4a34a1815c85466f162fa3a76`、main checkpoint `e52e473ae1685b3c2be0a040ab19f5ee55c66b8d`，與開發前相同。考慮 Jul26 broadcast boundary、Jul29 readiness、Jul31 invitation lifecycle、Aug10 scoped aggregates、Aug5 Auth callback/email、Aug3 conversion destination、Oct6 optional controls、Oct15 financial source ownership、Nov11 account segments／coherent report recovery、Nov12 strict configured times、Nov13 source-owned appointment consolidation。只採納中立契約，無匯入 pilot 身份、客戶、資料、價格、憑證或實作。Canonical proposal 仍透過既有 draft PR #88，未聲稱已合併。
