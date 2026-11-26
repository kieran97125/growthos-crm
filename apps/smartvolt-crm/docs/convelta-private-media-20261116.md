# Convelta 私人附件收發

日期：2026-11-16 HKT。程式及雲端CI驗收已通過；附件正式schema已安裝並完成合成資料庫驗收。本輪App仍未部署，真實渠道、原音、裝置及Owner驗收未完成；完整閘門見[本輪發布記錄](convelta-inbox-expansion-20261116.md)。

## 使用體驗

- 實際統一收件匣及原 WhatsApp／Meta 收件匣提供附件入口；相片、影片、原音與文件保留於正確對話，文字與附件可同時顯示。
- 選擇檔案、上載進度、取消、實際內容核對及明確傳送分開；沒有按確認不會向客戶發送。圖片／影片／語音可預覽及播放，PDF 可開啟，原檔可下載。
- 對話編輯租約、當下角色／產品／品牌／歷史範圍、渠道及服務時限沿用原有發送權威。未確認的傳送可以核對原紀錄，不能當成送達或另起一次重發。
- 暫停新發送或超過服務時限後，原有未確認附件仍可重新開啟核對。未上載的本機檔案可以移除；失敗傳送證據保留，並可另行明確準備重試。
- 待核對資料按已登入用戶、公司及對話隔離；切換用戶不會帶入同事的檔名或收據。舊版未分用戶的本機紀錄直接移除，不讀取或搬移。
- 語音轉錄沿用已發布原音功能；讀取附件不會呼叫 ASR、其他付費模型或自動發出文字。

## 私人儲存及內容核對

`convelta-attachments` 是私人 bucket；瀏覽器無新原表或 bucket 讀取權限。經登入／來源／品牌核實後，只取得特定物件的上載授權或短效檢視／下載網址，不提供原平台 URL、原始 webhook 或平台密鑰。

檔案先直接上載到受限私人位置，避免 Vercel 函式的大型請求／回應限制，再由服務端以實際 bytes 核對格式、大小及 SHA-256。瀏覽器 MIME 及檔名不能作內容證據。通過後由服務端寫入 canonical Content-Type，物件 bytes 不可由原有 signed upload token 覆寫。

唯一額外直接依賴是精確鎖定 `file-type@22.3.0`，原已經由 `music-metadata` 間接安裝；將維護中的檔案 signature／容器辨識用於本功能。偵測有 1 MB 單次配置及 5 秒取消限制；音訊另核對實際長度，OGG 音訊核對 Opus。Office 文件只提供下載，不於應用程式執行。

| 檔案類型                | 應用程式上限 |
| ----------------------- | ------------ |
| 圖片                    | 5 MB         |
| 語音／影片              | 16 MB        |
| PDF／支援的 Office 文件 | 25 MB        |

格式另按渠道檢查，不能將所有格式當成所有渠道均支援。例如 WhatsApp 圖片只提供 JPEG／PNG、影片 MP4；Instagram 文件只提供 PDF。真實 provider 接收及裝置播放仍需要外部驗收。

每公司15分鐘最多40次上載預留／250 MB，取消亦不重置配額。已取消物件等原signed-upload窗口過後才作最終清理，避免取消後較遲完成的 PUT 變成永久孤兒物件。私人排程每次最多處理20件；已關聯傳送的附件，不論成功、失敗或未知，均保留證據，不會被 staging 清理刪除。

## 發送及來源

`sv_media_claim` 於同一資料庫交易內將檔案指紋、actor、來源對話、caption及client UUID綁定，再呼叫原有 WhatsApp／Meta claim。只有 `dispatch=true` 才會呼叫渠道傳訊 API；同一client replay不再外發。接收、失敗、未知與送達仍使用原生訊息收據及provider回報。Meta／音訊不支援的附加caption不會被偷偷轉成第二則外發。

原平台附件只從已驗簽及持久保存的實際message／attachment index取得。下載限HTTPS的受信Meta CDN，禁止redirect；WhatsApp metadata使用已設定Graph版本，並核對provider hash（如有）。同名、電話相似或任意URL均不能建立附件來源。

## 驗收紀錄

- `tests/media.test.ts`及`tests/media-database.test.ts`：23項通過，包含權限、私有grants、未核實／過期／已取消拒絕、不可變內容、租約／revision、一次claim、unknown replay、來源真確性、原signed-upload窗口後清理及公司上載配額。
- `e2e/media.spec.ts`：9項已於[完整CI 43747223406](https://github.com/kieran97125/growthos-crm/actions/runs/43747223406)的雲端Chromium實際通過，涵蓋明確預覽、私人上載後真實byte inspector、偽PDF拒絕、取消及遲到結果隔離、未知結果核對、用戶切換隔離及舊紀錄清理、桌面／手機可及性及截圖。來源為`e6078da09b5b11e37eb7c0bcd49e9ff73c4d4f5e`。
- 實際統一收件匣另由同一CI的14項integration browser情境驗證；native PostgreSQL亦通過附件競爭admission、同一收據及unknown replay。這些均為合成驗收，未發真實客戶訊息。
- 正式migration為`20261115184217_convelta_private_media`，SQL MD5 `c5d22e536a4db8abe3f7f38425a6cc2e`。hosted合成附件階段PASS，回滾後公司／Auth合成行數為0；bucket實際核實`public=false`、上限25 MiB，兩張附件表包含於13張已安裝表的RLS／零browser grants核對。
- 本輪沒有真實provider收發、公司客戶原音或付費模型品質驗收；新App未部署，正式憑證未變。網站schema仍受阻，不能以附件schema及CI成功宣告整輪已完成。

Product Learning Sync checked：fresh canonical protocol／index／checkpoint，以及07-17 regression、07-26 broadcast boundary、07-29 connector readiness、08-10 permission-aware scopes及10-06 description density。只採中立契約；未匯入Enterprise Pilot程式、身份、資料、價格、網域或憑證。
