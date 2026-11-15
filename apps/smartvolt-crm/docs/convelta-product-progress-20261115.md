# Convelta 產品進度與客服教練

更新日期：2026-11-15（香港時間）。1–3 已發布；使用者再指示「做456吧」，現正實作 4–6，7 繼續保留。本文件與 [工作卡 #12](https://github.com/kieran97125/growthos-crm/issues/12) 為接續入口。當前正式 runtime 為 `3533fc3`；4–6 未完成前不計作上線。

## 本輪範圍

| 編號 | 功能               | 對現有產品的增量                                       | 驗收要求                                                                         |
| ---- | ------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1    | AI 下一步建議      | 在既有摘要上增加缺漏資料、下一問、可編輯草稿與對話依據 | 不自動生成或外發；切換對話不混用；過時建議不可套用                               |
| 2    | 客服質檢與流失原因 | 附原句的改善建議、暫定顧慮及主管更正歷史               | AI 判斷與人工覆核分開；不偽造 CSAT、歸責或確認流失                               |
| 3    | 成功話術學習       | 提議 Q&A、溝通模式及知識缺口，編輯採用到品牌知識       | 成功標示需精確連結核實預約；公司隔離；來源與版本可追溯；話術不充當價格／政策證據 |

## 擴充範圍與當前狀態

| 編號 | 功能                             | 當前界線                                                         | system card                                |
| ---- | -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| 4    | 客戶長期記憶與單一時間線         | 本輪實作中：版本化偏好／需要、修正歷史、來源時間線及後續 AI 脈絡 | customer-memory；memory-live-acceptance    |
| 5    | 行為分眾自動更新                 | 本輪實作中：規則、真實來源及時間驅動入退組、推播／標準旅程資格   | dynamic-segments；segments-live-acceptance |
| 6    | 廣東話／英文語音轉文字與需求抽取 | 本輪實作中：私有原音、安全下載／上載、逐字稿、人工更正與原句摘要 | voice-transcription；voice-live-acceptance |
| 7    | 對話內報價與收訂                 | 現有人工付款登記不等於自動收款；連結與供應商回寫待做             | chat-payment-links；pos-acquiring          |

## 整體產品

| 範圍       | 已有能力                                                         | 仍待處理                                         |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| CRM        | 客戶目錄、跟進、階段、團隊派客、主管 SLA 與編輯接手              | 真實渠道及營運量驗收                             |
| AI         | 品牌知識、網站 FAQ、引用草稿、摘要、意向、翻譯、C 與客服教練 1–3 | 本輪 4／6；真實案例品質及正式流量成效            |
| 推播與旅程 | 三步推播、標準旅程、持久排程、同意／退訂及防重                   | 真實合資格收件人與平台回執；自由 Flow 執行引擎   |
| 成效       | 預約、到店、核實收款退款、團隊渠道及活動關聯                     | 公司廣告資產、真實 Meta 事件與來源成本對帳       |
| 團隊與提醒 | 權限及邀請生命週期、App 提醒、通知伺服器配置                     | 邀請郵件實際接受、使用者裝置訂閱與送達           |
| POS        | 日曆、服務、訂單、人工核實收付款、套票及帳簿讀模型               | 收單服務、規模化寫入、對帳／恢復、班課與庫存     |
| 官網與渠道 | 官網及查詢收件；各訊息渠道收發程式                               | 各公司真實授權／雙向收發；社交品牌狀態需官方讀回 |

原 ABC 發布及真實啟用驗收沿用 [工作卡 #10](https://github.com/kieran97125/growthos-crm/issues/10)。不因新功能完成而關閉原有未完成項目，不以合成測試、空資料或部署 READY 冒充客戶營運成效。

## 架構與依賴

現有 AI SDK 7.0.166、Zod、Supabase、SWR、Lucide、Playwright／axe、PGlite 沿用。4–6 唯一新增正式依賴 `music-metadata@12.5.0`，用於轉錄前核實實際音訊容器、格式與長度；Node24、鎖檔及伺服器邊界保留。沿用 AI Gateway、每日共用配額及持久收據，瀏覽器不獲 raw table／音訊 bucket 權限。

學習建議不是自動訓練模型。採用的 Q&A 保留有效期與引用；溝通模式只作 style guidance，不作事實來源。既有 AI 草稿與轉化真實結果保持不同權威。

## Product Learning Sync checked

已讀 canonical protocol、index `1080e9542f7845a4a34a1815c85466f162fa3a76`、checkpoint `e52e473ae1685b3c2be0a040ab19f5ee55c66b8d`，及以下相關 entries：

- 2026-07-16 CRM operations extraction：集中對話及客戶脈絡，配置代替客戶硬編碼。
- 2026-07-17 CRM regression acceptance：登入、載入、桌面／手機與失敗證據契約。
- 2026-07-26 broadcast operations boundary：AI 建議不能越過 CRM 外發權威。
- 2026-08-10 permission-aware aggregate brand scope：範圍與角色在服務端重驗。
- 2026-10-06 report description density、optional operator settings：少字、漸進揭露、保留關鍵錯誤。
- 2026-11-13 reviewed appointment owner consolidation：精確事件權威，不能用同客戶歷史或名字相似推定本次成功。

採納中立設計與驗收契約；沒有匯入 Enterprise Pilot 客戶、對話、價格、憑證、資料或實作。Canonical checkpoint 更新經既有 reviewed proposal 接續，不直接覆寫主分支。

## 本輪驗證記錄

1–3 已於 2026-11-15 18:18 HKT 發布，runtime `3533fc3749a8e7a26b209ee55b87f541239c7f29`／`dpl_BL7n6aDFShYaSqYoHjwfDX4vxdBy` READY，正式 app.convelta.io alias 一致。[PR #13](https://github.com/kieran97125/growthos-crm/pull/13) 保留來源。C 新任務誤報無權限已修正，既有任務仍重驗公司／使用者／產品。Owner 已讀回新任務／重載、對話學習、品牌話術及主管質檢入口；沒有製造真實客戶或付費模型請求。

[CI 43702644602](https://github.com/kieran97125/growthos-crm/actions/runs/43702644602) 全通過：377 單元／資料庫、2 Workflow、4 首屏、141 瀏覽器（6 推播＋20 教練／AI＋115 原流程），包括15項教練場景；原 CRM [43702644614](https://github.com/kieran97125/growthos-crm/actions/runs/43702644614) 成功。CI merge `f7f3b97` 與 runtime app tree 同為 `4cb448d013092173a0c487f7744fe9b0c088e1a8`。Artifact14156949272 SHA256 `08665ebd64bdadfc86668b33e6d8ee8be7a66816d7942be31c08d86b1c5c014b` 核對，桌面／手機畫面已檢視。本機 Chromium socket限制不當作本機瀏覽器通過。

兩項新增 migration 已安裝及原文 MD5 核對，來源檔名對齊平台實際版本：

| migration                                | SQL MD5                          |
| ---------------------------------------- | -------------------------------- |
| 20261115094751_convelta_coaching_roadmap | c0cb6f6b6de5d176c458750bcfdd787b |
| 20261115094755_convelta_cs_coaching      | 4ff7f9a3285739bdab4828f1fab2a502 |

原生 PostgreSQL 的 `BEGIN…ROLLBACK` 合成案例驗收通過，涵蓋隔離、防重、共用配額、模型偽造成功拒絕、主管覆核、話術採用及過時來源拒絕；回滾後合成公司／正式分析／覆核均為 0。新增兩表 RLS=true、瀏覽器原表 grants=0；既有安全 WARN 數目不變，新增 server-only 表的 RLS-no-policy INFO 不以擴大權限消除。既有工作區 revision 5 及 inbox／POS／studio／broadcasts 指紋保持原狀。

## 4–6 實作契約與驗收

工作分支 `feat/convelta-memory-segments-voice-20261115`，以已發布3533fc3為基底。型別／資料庫／瀏覽器及發布證據待本輪完成後寫回同一文件。

- 記憶是精確客戶／品牌的同事記錄，修正及停用追加歷史。AI 只用作客戶背景，不能作收費／政策／預約證據；生成期間更正必須使舊脈絡失效。時間線依實際訊息、身份連結、預約及核實 POS 來源組合，權限過濾在分頁前。
- 分眾由已保存規則、來源事件及時間掃描更新，有入組／退出歷史。推播保存既有名單快照，執行時仍重驗當下分眾、同意、抑制及渠道資格；標準旅程入組及每一步同樣重驗。
- 語音只處理實際原音，私有保存並核對類型、大小及時長。轉錄需明確操作，共用用量及防重；原文、人工更正及附原句的需求／日期保持分開，不把暫定日期當已確認預約。

真實使用分別由 memory-live-acceptance、segments-live-acceptance、voice-live-acceptance 追蹤；7及原#10不因本輪完成而關閉。

Product Learning Sync checked（4–6）：fresh protocol/index/main checkpoint SHA保持上列；重新讀07-16CRM extraction、07-26broadcast boundary、07-29readiness／identity、08-10permission-aware scope、10-06density及11-11account-owned report segments。僅採中立契約；source-specific projections／報告分類及客戶資料不移植。


## 4–6 中斷後恢復檢查

2026-11-15 HKT 重新讀回：正式 runtime 仍為 `3533fc3`；新分支遠端同為此舊 head，當時沒有本輪 Actions run。4–6 原始實作僅留在工作區，不能把未執行的雲端驗收當成通過。

- 恢復時完整本機單元／資料庫測試420項通過，型別、ESLint、正式建置及2項Workflow通過；本機 Chromium 因 `socket() failed: Operation not permitted` 無法啟動，不計作瀏覽器通過。
- 獨立覆查修正客戶時間線5類營運事件標籤、分眾全量同步阻塞、POS分眾歷史的權限收窄保護，以及語音Graph版本／保守粵英需求原句識別。
- 完成後草稿套用另加只讀 freshness 驗證，來源變更時不得沿用舊建議，不重新扣配額或發起模型請求；同事已輸入的回覆保留。
- 已安裝且來源 MD5 相同：`20261115105954_convelta_voice_transcription` → `313acffae8439b2068f357f9ca963027`；`20261115110743_convelta_customer_memory` → `1e064ecf38d6e31131582eec75231f4e`。
- 分眾 migration（MD5 `e1c3e06a2dac47712534bc4c6e42ca58`）的平台確認逾時，尚未安裝，不以其他工具繞過確認。完成全部可獨立驗證的程式／CI後再提交同一可審核更新。
- 4–6 仍未正式發布；原1–3、7及#10的真實渠道／邀請／裝置送達／Meta／成本對帳界線不變。原音實際粵英轉錄質素、實際客戶記憶／分眾成效及較大客量維護延遲保留獨立驗收卡。

Product Learning Sync checked：fresh canonical protocol/index/main checkpoint及相關entry已讀；existing reviewed proposal [#88](https://github.com/kieran97125/leadhub-source-os/pull/88) 更新至 `0064ca3`，未宣稱已合併canonical checkpoint。

只讀草稿freshness migration已安裝：`20261115111809_convelta_completed_draft_freshness`，來源MD5 `b9051bf5d08721d7ff1899675a35b952`。23項記憶／套用驗證、17項分眾、17項語音focused驗收通過；新增5項草稿套用瀏覽器場景待雲端驗收。


## 停用分眾驗收修正（2026-11-15 HKT）

`2d2e15f` 的 CI43708597728 已完成434項單元／資料庫、2項Workflow、正式建置、4項首屏及nativePostgreSQL。推播8項互動中7通過、1失敗：測試仍預期舊版「請重新選擇」，而畫面已明確指示「請返回第一步重新選擇」。因此該次後續教練／4–6／原流程瀏覽器驗收被跳過，不能計作完整通過。

已將該測試改為按警告語義與問題文字定位，保留禁用發送、零提交及重選提示檢查，並在同一案例驗證返回第一步、停用名單不會自動換成全客群、明確重選後草稿名稱與變數保留，以及最後提交不夾帶舊分眾。沒有移除斷言、跳過案例、放寬等待時間或修改原本已存在的發送保護。現有專業測試工具足夠，沒有新增依賴。

本機該檔ESLint／TypeScript與diff檢查通過，8項browser case可列出；完整雲端結果待本次提交。已安裝roadmap SQL來源MD5不變，檔名對齊正式平台20261115112412。Product Learning Sync checked：重新讀canonical protocol/index/checkpoint，以及07-26broadcast boundary、07-17regression、07-29readiness；沿用既有中立契約與review proposal#88，未移入客戶資料。


第二次雲端 CI43721216943：434單元／資料庫、2Workflow、4首屏、8推播、20教練／AI及nativePostgreSQL通過；4–6互動33項中31通過。餘下兩項分眾fixture使用fastForward模擬休眠並合併計時器，與SWR去重清理的順序不符，未發出預期新GET。已改用runFor按原31秒／16秒順序推進，先驗證實際新讀取及停用狀態，再保留原有入退組、停用提示、禁用按鈕及零提交斷言；沒有人工觸發刷新或放寬期限。旅程fixture補回正式.eng-work容器。完整重跑待本次head。

正式分眾migration於本輪再次由原工具提交，平台確認仍逾時；獨立查核migration及schema均未安裝。未繞過確認，正式App仍3533fc3，不能在資料庫缺少必要RPC時發布4–6。已安裝其他四項SQL來源不變。


## 最新發布準備

候選64f352b完整CI434／181／4／2及nativePostgreSQL全部通過；分眾20261115144827已安裝並通過完整native回滾。之前分眾平台確認逾時已解除，最新阻塞改為**production部署遭automatic approval review拒絕，需使用者明確批准**。正式仍3533fc3。詳見[4–6發布準備與驗收](convelta-customer-intelligence-readiness-20261115.md)及#12；先前紀錄保持為歷史，不代表目前仍缺少分眾schema。
