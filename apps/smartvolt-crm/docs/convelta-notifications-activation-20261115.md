# Convelta 通知伺服器啟用驗收

狀態：通知公／私鑰已按使用者本輪明確授權完成設定，正式伺服器已啟用；裝置訂閱及實際接收仍未完成。此記錄不把伺服器配置、瀏覽器授權、推送服務接納及裝置顯示混為同一件事。

## 已授權及完成

- 目標維持現有 Convelta Vercel production 專案 `smartvolt-crm`／`prj_gGZ6T5HEMjNAdhcZNX0x6scQEFg0`；不建立另一個帳戶／專案，亦不向 preview／development 放置同一組鑰匙。
- 新產生一組有效 P-256 VAPID 配對。`SMARTVOLT_PUSH_PRIVATE_KEY` 為 sensitive／不可讀回；`SMARTVOLT_PUSH_PUBLIC_KEY` 加密儲存；兩者只配置 production。沒有把私鑰寫入 Git、文件或本機憑證檔，亦沒有輸出私鑰值。
- 公鑰 SHA256：`8ef650dbc52be3a577201453138f3a103c38e3828f0739944f2aa8ae8f6ad31d`。此為公鑰的完整性指紋，不包含私鑰。
- 已驗收程式 `58e489f8f78993ce1f584cf659449d1dc15c60a6` 於 2026-11-15 14:16:22 HKT 重建為正式部署 `dpl_CwRY28rc8gG8FZnXiv46AyknAHYJ`，READY 且 `app.convelta.io` 指向此版本。這一步只套用環境設定，程式 bytes 不變。
- 正式登入的提醒頁重載後，「啟用目前裝置」及離線推播偏好由不可用轉為可用，確認新設定已由 runtime 讀取。實際點擊設定仍未建立裝置訂閱，不能稱為推送送達。
- 原生排程於 14:20 HKT 自動成功執行：checked 1／completed 1／failed 0。沒有手動喚醒私人 maintenance、建立 CRON_SECRET 或替代 bearer credential。
- 正式登入、service worker 各回 200；未登入提醒 API 401，私人 maintenance 公開 GET 404；回應維持 private/no-store。

## 已登入畫面與修正

原有 connected browser 已恢復，可沿用使用者既有登入，無需索取密碼／cookie。已讀回跟進、主管、報表、官網交接、自動追客、群發、提醒、派客及 Meta 設定；派客及 Meta 重載正常。沒有提交跟進／更表／營銷／Meta 設定表格，也沒有觸發模型或客戶外發。

正式報表初次開啟重現 React 418 文字 hydration recovery。原因是相同日期的 locale 標點在伺服器與 Chrome 不同。正式修正 `8157daf74191145dab3c6fbfdfdb0f3a2a733d67` 將 ABC 日期共用香港時區格式化器，從指定 gregory／latn／h23 日曆部分組合一致文字；不改來源時間、報表截止或金額，也不隱藏 hydration 警告。已有午夜、跨預設時區及無效來源時間測試，以及報表實際香港截止文字的瀏覽器斷言。

- [CI 43685808506](https://github.com/kieran97125/growthos-crm/actions/runs/43685808506) 全部成功：344 程式／資料庫、126 瀏覽器（6 群發＋120 其餘）、4 首屏、2 實際 Workflow；原生 PostgreSQL 競爭驗收亦成功。原 CRM CI 43685808508 成功。
- 該確切來源於 2026-11-15 14:43:21 HKT 發布為 `dpl_9i83EPUswAJACkZrfHPFY9um5vWw`，READY，正式 `app.convelta.io` 已指向此版本。依賴、SQL 及排程設定 bytes 與原 ABC 58e489f 一致，無新 migration 或權限變更。
- 正式 Owner 以新的瀏覽器分頁冷開啟報表，再重新載入；截止分別顯示 `2026-11-15 14:45:03`／`14:45:10`（香港），兩次無 error／warning。正式提醒頁重新載入，啟用裝置按鈕可用且 console 無 error／warning。這是實際登入 UI 讀回，不是 fixture。
- 此次部署初始 Vercel error／fatal 掃描為空；不聲稱長期無錯誤。完整九個模組入口已讀回，正式登入頁驗收卡完成。

## 裝置驗收限制

- 當前尚無已儲存裝置或 push attempt。瀏覽器端裝置設定未完成，需使用者檢查／允許該網站的通知並完成訂閱。
- 公司目前無合資格正式提醒來源；不建立假客戶、假對話、假預約或假 C 觀察來製造送達證據。
- 真正裝置接收、按通知返回後重新驗權、撤銷及過期端點的現場驗收繼續保留在 `inbox-followup-notifications`。原有隔離程式／資料庫測試不取代這項驗收。
- 真實渠道、邀請寄送、Meta 回傳與自由 Flow 執行器的未完成工作維持各自工作卡，不受本輪金鑰授權擴大。

## 資料保留

工作區 revision 仍為 5，inbox／POS／studio／broadcast 四部分指紋與 ABC 前一致。CRM 客戶、裝置及 push attempts 均為零。WA 外發、Meta 外發、邀請及本輪新 AI 請求亦全部為零。沒有因啟用通知改動同意、營銷、渠道憑證、既有負責同事或業務資料。

## Product Learning Sync checked

本輪重新讀取 canonical protocol `6a80846bfa10af9a4b84304688b19a326d0752b6`、index `1080e9542f7845a4a34a1815c85466f162fa3a76`、main checkpoint `e52e473ae1685b3c2be0a040ab19f5ee55c66b8d` 及既有 draft checkpoint。考慮 `2026-07-29-connector-readiness-and-identity-boundary` 與 `2026-10-06-optional-operator-settings`；只採用中立的準備度、明確錯誤及漸進設定契約，沒有匯入 pilot 身份、資料、憑證或實作。Canonical 更新沿用 draft review PR #88，不宣稱已合併。
