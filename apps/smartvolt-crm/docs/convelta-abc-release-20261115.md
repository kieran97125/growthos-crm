# Convelta ABC 發布驗收記錄

狀態：ABC 本輪程式功能已於 2026-11-15 06:03 HKT 正式發佈至 https://app.convelta.io；渠道、郵件、Meta 資產與裝置啟用條件按下表保留。

2026-11-15 14:43 HKT 追加發布：使用者已明確授權通知金鑰，正式通知伺服器已啟用；修正 Owner 現場驗收找到的日期 hydration 問題。最新為 344／126／4／2 全通過，正式登入畫面及重載驗收完成；裝置訂閱／接收仍未完成。詳見 [通知啟用驗收](convelta-notifications-activation-20261115.md)。

使用者已授權完成及發布原來 A1–A5、B1–B4、C1–C4。這是共用 CRM 程式能力，仍按產品、角色、品牌及來源權限使用；A5 只處理 Convelta 自身官網查詢。

## 正式來源

- 最新 Runtime commit：`8157daf74191145dab3c6fbfdfdb0f3a2a733d67`。
- 最新 Production：`dpl_9i83EPUswAJACkZrfHPFY9um5vWw`，READY，正式 alias `app.convelta.io`；Node 24；14:43:21 HKT。
- 最新 [CI 43685808506](https://github.com/kieran97125/growthos-crm/actions/runs/43685808506) 全通過：344 程式／資料庫、126 瀏覽器、4 首屏、2 Workflow、原生 PostgreSQL；原 CRM 43685808508 通過。以下初次發布／圖片保留 CI 為原 58e489f App 來源的歷史證據。
- 初次 ABC Runtime `58e489f8f78993ce1f584cf659449d1dc15c60a6`／Production `dpl_7hcaDVRs7zHTSL7G6mbxteRnWUQ2` 保留；通知設定的同來源重建 `dpl_CwRY28rc8gG8FZnXiv46AyknAHYJ` 亦保留。
- 回復來源：原 A2 `dpl_3VPZTuN3tSGfQw6gQgGZqLUKKRky` 保留；資料庫為相容的新增 schema，不移除業務紀錄。
- [CRM CI 43645028088](https://github.com/kieran97125/growthos-crm/actions/runs/43645028088)：341 程式／資料庫、2 實際 Workflow、4 正式編譯首屏及 126 瀏覽器（6 推播＋120 其餘）全部通過。原 CRM CI 43645028182 亦通過。
- 原始 browser artifact `14133737642`，SHA256 `60007afe0bef626d556c9c5b31b76b69ce8082c03774c6b2a1322bb4917d47d4` 已下載核對。
- [保留完整圖片的 CI 43646879441](https://github.com/kieran97125/growthos-crm/actions/runs/43646879441) 在記錄／驗收設定來源 `e4b521b6ffe0e29de39e22aac3650b803861fba9` 再次通過 341／126／4／2、原生 PostgreSQL；原 CRM 43646879435 亦通過。App runtime、依賴、設定及 SQL 與正式 58e489f 完全相同。推播輸出另存 `campaign-test-results/`，避免其後 120 項測試清理圖片；artifact `14134518611`，SHA256 `2de4a8e9e6b739e127f0a904073d8d8fe49f375604b22092cedaa6c819c91200` 已下載核對，最終手機版三步發送確認畫面已視覺檢查。

## 本輪功能

| 工作包 | 已實作能力 | 外部啟用／驗收條件 |
|---|---|---|
| A1 | WhatsApp、Messenger、Instagram 分別顯示接駁、來訊、平台接收及送達證據 | 公司需接通自己的真實渠道；當前零接駁 |
| A2 | 角色、品牌／產品權限、停用／復原及歷史；邀請生命週期程式 | 郵件 sender、Auth redirect 及指定郵箱接受仍待接通 |
| A3 | 持久 outbox、Workflow 睡眠／復原、一次派送 admission、租戶公平掃描、配額及自動訊息總開關 | 私人平台排程首輪已實際成功；不需要 CRON_SECRET。真實渠道派送仍按公司接駁驗收 |
| A4 | 品牌／渠道／用途同意、證據、退訂及當下發送資格 | 真實同意由公司記錄；匯入電話不當作同意 |
| A5 | 官網來源 ID、保留原資料、排除測試、負責同事、狀態、備註及香港跟進時間 | 已啟用現有唯一 Convelta 品牌；當前零正式查詢、三筆測試排除 |
| B1 | 同步正式已審批文字模板、語言／版本／變數；對話內 UTILITY 範本回覆 | 須自己的已接通 WA、正式模板及服務聯絡同意；媒體／按鈕模板未提供 |
| B2 | 三步推播、分眾、姓名／品牌個人化、香港排程、取消及每收件人結果 | 公司營銷開關、同意、quiet time、頻率及平台資格重檢 |
| B3 | 未回覆、預約前提醒及完成服務後回訪；來源變動／回覆／真人接手即停止；不可變發布版本、每客進度及停止原因 | 需真實渠道與來源紀錄；進階自由 Flow 圖仍明示為設計器，不把畫圖稱為已執行 |
| B4 | App 提醒、去重、延後／完成、安靜時段；關閉 App 後的 C 確定性觀察與來源已由實際排程更新；裝置訂閱、撤銷及失效處理程式 | 使用者已明確授權，VAPID 已配置於正式環境，裝置啟用按鈕可用；實際裝置訂閱／接收仍未完成 |
| C1 | 辦公時間 SLA、真人與自動回覆分開、主管佇列、舊資料未量度覆蓋、每視窗編輯鎖／接手及草稿保留 | 真實量測由新觀測起；不補造歷史零延遲 |
| C2 | 固定分店 ID、技能、每週更表、休假；配合在線／接客上限及公平派客 | 公司按實際團隊設定；不搶走既有負責同事 |
| C3 | 完整聚合後分頁、期間／首次查詢客群、截止時間、確認／到店／核實收款退款、真人表現、推播關聯、成本證據 | 缺歸因／成本如實標示；推播前七日最近接收關聯不代表因果或廣告 ROI |
| C4 | 品牌資產所有權／存取核實、獨立量測同意、加密設定、真實確認／全額付款事件、穩定 ID、測試／正式及接收回執 | 公司自己的 Meta dataset／business／ad account／token 及真實事件驗收；接收不等於匹配或歸因 |

## 驗收與來源

- 最新正式來源 344 項程式／資料庫測試通過；原生 PostgreSQL 競爭派客、接客最後一位、編輯／接手、同意及共用配額通過。
- 實際 Workflow 引擎的持久睡眠／醒來及取消 admission 有獨立驗收。
- 126 項瀏覽器全部通過：推播確認前零提交、香港排程、斷線同一請求、完整分頁、權限、手機及無障礙；已修正第二步按鈕提早提交及手機邊框超出。
- 四十張新表均 RLS 且 browser 無 raw table 權限；七十六個相關程序均 invoker、空 search path、browser 不可 execute。
- 工作區 revision 5；inbox/POS/studio/broadcast 指紋與原始 A2 一致。客戶、渠道接駁及外發仍為零；無新邀請或模型請求。
- 安全 WARN 保持原有 own-site definer／password 類別；新服務端表的 RLS-no-policy INFO 不以放開 browser 作修正。兩個新 SLA FK 索引已補齊。
- 初次發布的登入 context 阻塞已解除：原連接瀏覽器恢復，九個正式 Owner 模組入口已讀回，提醒／派客／Meta／報表重載驗收通過。發現的報表日期文字 hydration 問題已於 8157daf 修正，新的正式報表冷開啟及重載 console 為空；沒有索取或讀取密碼／cookie。
- 正式未登入 HTTP 讀回：10 個受保護 API GET 回 401，報表頁 307 到登入，無 Origin 提交 403、同站 Origin 且無登入提交 401；私人 maintenance GET／POST 均 404。回應採 private/no-store，沒有建立臨時驗證分享連結。
- 部署後首次 error/fatal 日誌掃描為空；屬初始觀測，不是長期無錯誤保證。背景排程為私人 15 分鐘觸發，實際啟動時間仍受平台 jitter 影響。
- 首輪私人平台自動 invocation 於 `2026-11-14T22:20:06.525Z`（2026-11-15 06:20 HKT）成功：`execution_maintenance_complete { checked: 1, completed: 1, failed: 0 }`，request `4pqbz-1794694795147-7b8a4a2144c9`，正式部署 `dpl_7hcaDVRs7zHTSL7G6mbxteRnWUQ2`、Node 24。公司 checkpoint `22:20:06.388251 UTC` 及正式來源快照 `22:20:02.155324 UTC` 已由資料庫讀回；無新模型請求。沒有手動啟動 maintenance 或外發客戶訊息。
- 系統卡共 79 張；發布卡、派送底層、C 背景觀察及正式登入驗收卡已完成。真實渠道、郵件、Meta 與裝置各自保留未完成卡，不以程式測試代替外部啟用。

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
