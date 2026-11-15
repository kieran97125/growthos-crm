# Convelta 收件匣與流程擴充

日期：2026-11-16（香港時間）。狀態：使用者已直接授權1–4實作並要求最高品質；四項程式實作完成，進行定稿驗收。正式部署及真實外部啟用另行核實。

工作分支：feat/convelta-media-social-widget-flow-20261116；基底59cdb1c（正式runtime64f352b）。

## 本輪交付

| 項目           | 實際能力與驗收邊界                                                                                                              | 現有工作卡                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1 完整附件     | WA／Meta圖片、影片、文件及原音，私有儲存、實際檔案驗證、預覽／下載、取消、重試及不可變派送核對；保留既有語音轉錄                | wa-media、meta-media                  |
| 2 留言轉私訊   | 指定FB／IG貼文／Reels及關鍵字；驗簽來源、精確帳戶／貼文權威、一次合資格私訊、防重、暫停／撤權及可查結果；未有互動不推定營銷同意 | social-comment-to-dm                  |
| 3 官網聊天     | 每間公司／品牌可嵌入的聊天窗，真實訪客訊息及真人回覆，來源網域／租戶隔離、私人訪客身份及防濫用；同名／電話不自動合併            | website-chat-widget                   |
| 4 自由Flow     | 任意有效畫布的不可變發布版本、圖驗證、條件／等待／人工交接、持久步驟及恢復；沿用派送權威，保留三套已實作標準旅程                | round-two-journeys                    |
| 5 通用外部整合 | 使用者明確押後；公司API憑證、通用Webhook、n8n／Make連接本輪不做。聊天必要專用端點及供應商已有Webhook不代表本項已啟用            | tenant-public-api-webhooks（planned） |

網上付款接駁保持押後；沿用人工核實付款紀錄。

## 品質與架構

所有正式讀寫在server重驗公司、產品、角色、品牌及歷史範圍。新增資料表RLS啟用、browser raw grants為0；原始來源、訪客秘密及附件不直接公開。跨來源身份只經精確已授權連結，不按名稱／電話推斷。

外發沿用持久派送／相同請求／未知結果核對；超時不能冒稱未發送或自動重發。回覆、接手、來源變動、停用、權限及各功能適用的模板／同意資格於執行前重驗。實際送達與模型品質需獨立真實證據。

網站訪客端點只服務特定聊天窗，不提供通用CRM資料API。每個嵌入來源受確切網域／origin及獨立visitor憑證限制，不以公開widget ID當讀取私人對話授權。

現有專業工具：React19／Next16、@xyflow/react12.12.1、@dagrejs/dagre3.1.3、SWR、Zod、Supabase、Workflow、Playwright／axe及PGlite。附件byte驗證將既有transitive file-type22.3.0列為精確direct dependency；無新增下載負擔，避免以副檔名或瀏覽器MIME冒充驗證。其餘新增依賴需有清晰用途，不以缺少package接受弱UI或資料架構。

## 驗收

- 圖片／文件實際檔頭、類型／大小／損壞、跨公司／品牌／歷史範圍、取消、失聯、相同請求與未知結果。
- 簽名Webhook、帳戶／貼文／作者、重複留言、過期／已回覆／撤權、私人回覆資格及結果。
- 網站跨origin／租戶／visitor拒絕、限速、防重、重新整理／重開、真人回覆及訪客身份獨立。
- Flow無效圖／循環／不可達／分支／支援節點、發布版本、暫停、同一來源、防重、等待恢復、人工接手及資格變動。
- 桌面／手機、鍵盤／accessibility、loading／error／empty、首屏及重載；新入口需接到正式CRM，不只存在示範fixture。
- TypeScript／lint／build、單元／PGlite、native PostgreSQL及完整雲端瀏覽器驗收。環境不准啟動本機Chromium時，不重試繞過、不計作通過。

本輪不發真實渠道訊息、邀請、推播、Meta事件或付費模型探測。真實帳戶授權、外發與原音品質沿用既有驗收工作卡。

## 整合及發布邊界

實際公司CRM入口已接上網站／社交訊息切換、原渠道附件及留言來源，不只交付測試頁。隱藏來源停止輪詢，草稿、選取對話及待核對命令分來源保留；切換公司或已驗證登入actor重建私人狀態。待核對附件及網站操作以公司＋actor隔離，重載不自動重發。

Flow保留原有三套標準旅程；新畫布發布後既有執行繼續使用其不可變版本、發送設定及發布者權威快照。商戶關鍵字分流清楚標示規則，不冒稱AI決策。表單節點建立待同事處理的資料收集工作；預約／回訪節點只以真實核實紀錄為依據，不偽稱原生WhatsApp表單或已預約。

網站聊天預設停用，支援首頁meta標記或DNS驗證；真實網站安裝、訪客訊息及真人回覆尚需公司實際驗收。社交留言私訊規則預設停用，須真實資產權限、貼文所有權及平台資格；一次私訊不代表取得後續營銷同意。附件不自動轉錄或呼叫付費模型。

私人排程沿用既有租戶分頁及共享派送／Workflow；新增Flow推進、留言私訊及到期附件清理各自保存結果，單項失敗不阻止其他模組恢復。沒有新增公開cron或一般公司API憑證。

初輪全套497項程式／PGlite、2項Workflow、lint、TypeScript及正式build通過；獨立覆查後的最終來源仍須以雲端CI、native PostgreSQL並行及完整桌面／手機browser結果為發布依據。PGlite功能預檢不等於native多連線競爭驗收；列出browser案例不等於執行通過。

## 2026-11-16 HKT 定稿驗收及發布閘門

[PR#16](https://github.com/kieran97125/growthos-crm/pull/16) 及本輪 issue#15 保存實作。來源`07d92249`的[native PostgreSQL job](https://github.com/kieran97125/growthos-crm/actions/runs/43741361081/job/132895110427)於01:31 HKT成功：四個新模組及原有並行驗收全部通過，包括網站設定鎖競爭、一次派送及未知結果。最初測試工具把psql的SQL NULL／boolean當JSON解析，已修正輸出編碼，保留全部斷言。

同輪雲端build／TypeScript／lint／程式測試／Workflow、4個首屏、8個推播、20個教練／AI及33個記憶／分眾／語音browser成功；remaining browser group於15分鐘job期限取消，不能當通過。artifact指出社交欄位可及名稱混入提示／字數、附件fixture超遠期限造成計時器溢位及提示字色對比不足。定稿修正保留原有案例／斷言／時限，另外加入C與發送掣不重疊、320／390px頁首操作完整、搜尋文字單行及正式Flow樣式驗收；下一個完整exact-head CI為最終依據。

正式資料庫目前只安裝`20261115173202_convelta_social_comment_replies`，與來源MD5 `8ebed139b052b737447306040b22cb54`一致；新規則0、啟用0。網站聊天migration的原生平台確認兩次逾時，未安裝；Flow及媒體migration尚未執行。正式App仍是上一輪runtime`64f352b`，本輪未部署。完整schema、hosted驗收及正式部署仍是發布閘門。

可重現的hosted檢查腳本：[回滾功能驗收](acceptance/convelta-inbox-expansion-hosted-verify-20261116.sql)、[唯讀來源／RLS／grants／私人bucket核對](acceptance/convelta-inbox-expansion-hosted-readback-20261116.sql)。目前只完成本機驗證，待其餘schema完成後才能在hosted執行；不能將腳本準備好當作正式資料庫已通過。

工具只顯示最後一個SELECT結果時，使用[單一結果回滾驗收](acceptance/convelta-inbox-expansion-hosted-safe-result-20261116.sql)：匿名DO的例外子交易回滾全部合成資料，再於同一結果傳回五項PASS／FAIL及公司／Auth合成行數；本機成功及兩種注入失敗均核實不保留合成行。這仍是循序功能驗收，native並行證據由CI獨立提供。

CI分組核對223個default browser情境：原有181個及本輪42個；新42個為Flow5、實際收件匣整合14、附件9、社交留言11及widget3。4個首屏另計。新功能獨立job及原有remaining job共用分組守衛，驗證檔案存在、無重複／遺漏；未知新spec預設保留在原job。各job保留15分鐘、單案例45秒及單worker；首次失敗即輸出報告，成功時完整執行所有選定案例。兩個browser job及native job必須全部成功，不能以其中一份綠燈代表全套完成。

功能詳細契約：[私人附件](convelta-private-media-20261116.md)、[網站聊天](convelta-website-chat-20261116.md)。本輪追蹤：[issue#15](https://github.com/kieran97125/growthos-crm/issues/15)。原有[#10](https://github.com/kieran97125/growthos-crm/issues/10)及[#12](https://github.com/kieran97125/growthos-crm/issues/12)的實際渠道／客戶／語音／裝置等驗收仍獨立保留。

## Product Learning Sync checked

重新讀canonical protocol6a80846、index1080e95、main checkpoint e52e473；相關07-17regression、07-26broadcast、07-29readiness、08-10permission-aware scope及10-06density已讀。沿用已審閱中立的身份、派送、驗收及漸進揭露契約；不移植Enterprise Pilot程式、資料、價格、品牌、網域或憑證。checkpoint透過既有review proposal#88記錄本輪設計與證據，不直接覆寫canonical主分支。

CI分組另核對`entries/2026-10-22-bounded-provider-qa-and-checkpointed-receipts.md`（c0bc126）：保留部分／取消／完成的證據界線；該項Observed實驗不作通過或實作採納，沒有從pilot移入測試harness或新的產品分類。
