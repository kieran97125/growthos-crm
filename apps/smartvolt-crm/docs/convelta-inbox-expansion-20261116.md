# Convelta 收件匣與流程擴充

日期：2026-11-16（香港時間）。使用者已直接授權1–4實作；四項程式及完整CI驗收通過。正式資料庫只完成社交留言、Flow及附件三項schema；網站schema仍受平台確認阻塞。本輪App未部署，Owner／真實外部驗收未完成。

工作分支：`feat/convelta-media-social-widget-flow-20261116`；基底`59cdb1c`。最終程式來源[`e6078da09b5b11e37eb7c0bcd49e9ff73c4d4f5e`](https://github.com/kieran97125/growthos-crm/commit/e6078da09b5b11e37eb7c0bcd49e9ff73c4d4f5e)，`app/src` tree為`bb2d8d2a5fdf3d116ae350c6bc41b4b4b01be17e`；正式runtime另見下方發布閘門。

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

## 2026-11-16 HKT 最終驗收及發布閘門

[PR #16](https://github.com/kieran97125/growthos-crm/pull/16)及[issue #15](https://github.com/kieran97125/growthos-crm/issues/15)追蹤本輪實作。以下分開記錄CI、正式資料庫及正式App，不能互相代替。

| 閘門           | 已核實狀態                                                                                                                                                                                                                                                                                    | 仍欠項目                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 程式及完整CI   | 上述來源的[CI 43747223406](https://github.com/kieran97125/growthos-crm/actions/runs/43747223406)全綠：506項程式／資料庫、2項Workflow、223項browser、4項首屏；native PostgreSQL並行亦成功。原CRM的[驗收 43747223409](https://github.com/kieran97125/growthos-crm/actions/runs/43747223409)成功 | CI屬合成環境，不代表正式渠道或Owner已驗收                                                               |
| 正式schema     | 社交留言、Flow及附件已安裝；來源MD5及下述合成資料庫驗收已核對                                                                                                                                                                                                                                 | 網站聊天migration未安裝                                                                                 |
| 網站schema     | 原生平台確認累計4次逾時，最近一次於11月16日HKT早上恢復後仍逾時；沒有成功套用                                                                                                                                                                                                                  | 須完成有效平台確認及migration，再重跑完整hosted驗收；未繞過確認                                         |
| 正式App        | 仍為上一輪`64f352bc31293be112847f4052db4dd341fc0daa`，deployment `dpl_7Ynx3VntUM8nu4rxRw1pGm65Nokk`為READY                                                                                                                                                                                    | 本輪新App尚未部署，schema安裝不代表新入口已上線                                                         |
| 真人及外部帳戶 | 本輪沒有新增可核實的正式Owner／真實渠道或網站啟用驗收                                                                                                                                                                                                                                         | Owner登入、畫面及reload；公司渠道資格、真實收發／回執、網站安裝與訪客雙向接待、實際附件／原音及裝置結果 |

正式schema來源紀錄如下；這些是migration SQL的MD5，與個別函數的來源指紋分開。

| 已安裝migration                                                                                                               | SQL MD5                            |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| [`20261115173202_convelta_social_comment_replies`](../supabase/migrations/20261115173202_convelta_social_comment_replies.sql) | `8ebed139b052b737447306040b22cb54` |
| [`20261115184134_convelta_flow_graph_runtime`](../supabase/migrations/20261115184134_convelta_flow_graph_runtime.sql)         | `a2267daafe74f3cfb8878c1dfd2adbfe` |
| [`20261115184217_convelta_private_media`](../supabase/migrations/20261115184217_convelta_private_media.sql)                   | `c5d22e536a4db8abe3f7f38425a6cc2e` |

正式資料庫已執行未改動的[單一結果回滾功能驗收](acceptance/convelta-inbox-expansion-hosted-safe-result-20261116.sql)：fixture、社交留言、Flow及附件共4項PASS；網站聊天1項FAIL，明確原因是`sv_web_chat_configure`未安裝。合成公司及Auth行數均為0。這是部分schema的循序功能證據，不能寫成四個功能全部通過；native多連線競爭由上述CI獨立證明。

[單一結果唯讀catalog核對](acceptance/convelta-inbox-expansion-hosted-catalog-result-20261116.sql)保留完整50個函數／17張表的預期項目，缺項不會被跳過。此聚合查詢的原生確認逾時，未取得整份hosted結果；其後以較窄的原生唯讀查詢，實際核實37個已安裝函數來源指紋全部相符、全為security invoker且只有service_role可執行，另外13個缺失函數全屬網站聊天。已安裝13張表全部RLS=true、browser grants=0；私人附件bucket的`public=false`、上限25 MiB，`storage.objects`的browser policies數為0。網站4張表仍缺失。

本機曾分別驗證完整及部分schema的catalog腳本；這只證明腳本能正確列出差異，不能代替hosted執行。回滾功能腳本亦已驗證成功、初始化失敗及單模組失敗均保留明確結果並回滾合成行；PostgreSQL identity sequence可能保留正常間隔。

合成hosted驗收前後，公司業務workspace revision仍為5，四項業務資料指紋未變。安全advisors為INFO 116，其中新增13項是服務端專用表不設browser policy的預期提示；WARN維持anon 2、authenticated 3及leaked-password protection 1，與原基準相同。

CI的223個default browser情境包含原有181個及本輪42個：Flow 5、實際收件匣整合14、附件9、社交留言11、widget 3，全部實際執行成功；4個首屏另計。分組守衛核對檔案存在、無重複或遺漏；未知新spec預設保留在原job。各job維持15分鐘、單案例45秒及單worker，沒有藉放寬時限取得通過。手機Flow驗收使用實際global CSS及正式容器範圍，保留按鈕樣式、axe及寬度斷言。

CI後只把Flow／附件migration檔名對齊實際hosted版本，並調整Flow資料庫測試cutoff；沒有runtime程式改動。重新執行46項focused資料庫檢查全部通過。這項檔名整理不構成新App部署，也不補足網站schema及真人驗收。

下一步是完成網站migration的平台確認，核對完整50個函數／17張表並重跑五項hosted合成驗收，然後部署本輪App，再完成Owner及公司外部帳戶驗收。上述閘門未全部完成前，本輪仍未達正式完成。

現有`wa-media`、`meta-media`、`social-comment-to-dm`、`website-chat-widget`及`round-two-journeys`卡已記錄程式／CI完成與發布阻塞，狀態為`blocked`；`convelta-expansion-program`維持`in_progress`。最新紀錄置前並保留原有歷史，既有三套旅程已發布的範圍沒有回退。第5及兩張付款接駁卡維持`planned`。

功能詳細契約：[私人附件](convelta-private-media-20261116.md)、[網站聊天](convelta-website-chat-20261116.md)。原有[#10](https://github.com/kieran97125/growthos-crm/issues/10)及[#12](https://github.com/kieran97125/growthos-crm/issues/12)的實際渠道／客戶／語音／裝置等驗收仍沿用原工作卡；第5項通用外部整合及網上付款接駁繼續押後，付款只作人工核實紀錄。

## Product Learning Sync checked

重新讀canonical protocol6a80846、index1080e95、main checkpoint e52e473；相關07-17regression、07-26broadcast、07-29readiness、08-10permission-aware scope及10-06density已讀。沿用已審閱中立的身份、派送、驗收及漸進揭露契約；不移植Enterprise Pilot程式、資料、價格、品牌、網域或憑證。checkpoint透過既有review proposal#88記錄本輪設計與證據，不直接覆寫canonical主分支。

CI分組另核對`entries/2026-10-22-bounded-provider-qa-and-checkpointed-receipts.md`（c0bc126）：保留部分／取消／完成的證據界線；該項Observed實驗不作通過或實作採納，沒有從pilot移入測試harness或新的產品分類。

既有[review proposal #88](https://github.com/kieran97125/leadhub-source-os/pull/88)已於`ef6022e0756146dbdc499dbd0d925e6fa6c4f0a2`記錄本輪程式驗收與部分hosted證據、網站確認阻塞及押後範圍；canonical主分支未改動，proposal未合併。
