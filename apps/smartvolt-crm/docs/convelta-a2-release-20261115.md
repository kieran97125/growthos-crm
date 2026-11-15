# Convelta：同事與權限核心發布

日期：2026-11-15（HKT）。使用者已授權上線。本輪發布 A2 的權限核心及設定介面，**不代表整個 A/B/C 已完成，也不代表電郵邀請已接通**。

## 正式版本

| 項目 | 已核實結果 |
|---|---|
| App | https://app.convelta.io |
| 團隊入口 | 團隊與設定 → 管理同事與權限 |
| Runtime commit | `f5682878742697aa52cf2a5309b51f355ea16424` |
| Production deployment | `dpl_3VPZTuN3tSGfQw6gQgGZqLUKKRky`，READY，正式網域已指向此部署。 |
| App 專案 | `smartvolt-crm`，root `apps/smartvolt-crm`，以已驗證的 Node 24 設定建置。 |
| CI | [43616362481](https://github.com/kieran97125/growthos-crm/actions/runs/43616362481)：typecheck、lint、build、293 項程式／資料庫、108 項瀏覽器、四項首屏及原生 PostgreSQL 併發檢查全部通過。原 CRM 工作流 [43616362475](https://github.com/kieran97125/growthos-crm/actions/runs/43616362475) 亦通過。 |
| Browser artifact | `14121823965`，SHA256 `9feb0046f30ac41e1ac650fa9caf7721fd74946fa3de5f6f960a32bb8d3f23c4`；已核對並檢視桌面總覽及手機邀請表單截圖。 |

Vercel 直接以已驗證 commit 建立 production deployment；Git 自動部署仍關閉。原部署 `dpl_Es1fAhBUk6EaidXBS1fAxutDCGC6` 保留為回復來源，沒有合併舊的 runtime／規劃 draft PR。

## 使用者得到的更新

1. 專用同事名冊、角色、品牌及 CRM／POS 使用範圍設定；Owner 管理，Manager 可查閱。
2. 成員停用、復原及權限歷史；Owner 保護及版本衝突檢查。舊同事名稱保留在歷史記錄，不因停用破壞舊對話。
3. 收件匣、客戶、跟進、知識庫、POS、帳簿及 C 的歷史資料均重新核對當下權限；C 另外保存產生答案時可用的品牌／產品範圍。
4. 公司設定改為清楚的團隊管理入口，系統工作卡預設收合；桌面／手機採現有 Convelta 藍白視覺。

這是共用 SaaS 程式能力，不寫死客戶名稱或品牌；可用範圍仍取決於公司已購買產品及個別成員權限。

邀請、取消、接受、席位預留與郵件提交分開記錄的程式已隨版本發布，但 `SMARTVOLT_INVITATIONS_ENABLED` 仍為關閉。正式頁面實際顯示「邀請郵件尚未設定。現有成員權限仍可管理。」，邀請按鈕停用。SMTP／Auth redirect 及指定收件郵箱接受驗收沿用 `staff-invitations` 工作卡，不把 API 模擬驗收當成真實寄達。

## 資料庫套用及原文核對

| 功能 | 平台實際版本 | 來源 SQL MD5／installed statements MD5 |
|---|---|---|
| 成員生命週期 | `20261114170223_convelta_abc_member_lifecycle` | `b6050a333941f72333676295ea034ce9` |
| 共用範圍及歷史保護 | `20261114170356_convelta_abc_scoped_operations` | `9841cd0b313092215348160799081b36` |

兩項 migration 均由正式 `apply_migration` 套用，再從 migration history 讀回完整 SQL 雜湊。平台產生實際版本後，來源檔名及再生器輸出位置按實際版本對齊；SQL 內容與通過 CI／實際部署的 `f568287` 完全相同。此對齊與發布紀錄不改變 App runtime 程式。

已讀回四個新表的 RLS 及 browser privilege：anonymous／authenticated 角色沒有 SELECT／INSERT／UPDATE／DELETE／TRUNCATE 權限。七個關鍵 RPC 均為 invoker、空 search path、browser 不可 execute，服務角色可執行。

正式 owner 的 CRM 授權、POS 服務同事清單、客戶清單及營運聚合均可查詢。安全 advisor 的 WARN 項目與發布前一致；新增四張服務端專用表只增加預期的 RLS-without-policy INFO，沒有因此開放 raw tables。

## 正式驗收

- 已登入 Owner 在實際 Chrome 開啟新頁，顯示真實同事、角色及 CRM／POS 範圍，席位 1／5；沒有建立假員工。
- 從公司設定進入新頁、返回設定、核對工作卡收合及重新載入皆可用。首個舊分頁的 focus 操作逾時，改用同一瀏覽器新分頁後完成驗收；兩次短暫 locator 等待在導頁途中逾時，隨後實際 DOM 及重新載入均確認正常。
- 正式頁面 console error／warning 為空，已檢視實際截圖並留下團隊頁供使用者查看。
- 未登入的 team／workspace API 為 401；私人頁面導回登入。公開 login／邀請回跳頁為 200，回應維持 private/no-store。
- 新部署的初次 error／fatal log 掃描沒有結果；此紀錄不是長期無錯誤保證。

公司工作區 revision 維持 5。發布前後 inbox、POS、studio、broadcast 四部分的指紋相同；成員仍為 1、客戶仍為 0，新增邀請、WhatsApp／Meta 外發及本輪 AI 請求均為 0。沒有發送訊息、調整 Owner 權限或改動客戶／業務資料。

## 尚待完成

電郵邀請接通及真實郵箱接受、A1 渠道接通、A3/A4 持久排程與發送資格、A5 官網交接、B1–B4 正式範本／推播／旅程／背景通知、C1–C4 主管預警／更表／完整成效／轉化回傳繼續保留在原工作卡。詳細狀態見 [issue #10](https://github.com/kieran97125/growthos-crm/issues/10)。

## Product Learning Sync checked

發布前重讀 canonical protocol、index、main checkpoint 與既有 draft checkpoint；版本與開發前一致。再次完整查閱 invitation lifecycle、permission-aware aggregate brand scope、optional operator settings、production Auth callback/email contract。開發時已查閱的 messaging boundary、connector readiness、financial/source authority 等契約保留原有判斷。

只採納中立的權限、復原、可見狀態與資料來源邊界；郵件正式接受仍待驗收。Canonical checkpoint 透過既有 draft PR #88 更新，不代表該 proposal 已合併。沒有匯入 Alyssa 客戶資料、身份、憑證、價格、網域或實作程式。
