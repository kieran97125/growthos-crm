# Convelta ABC：A2 重建及驗收紀錄

更新：2026-11-15（HKT）。權限核心已正式上線；電郵邀請仍待接通。正式發布證據見 [A2 發布紀錄](convelta-a2-release-20261115.md)。

上輪環境中斷後，新的執行環境確認未保留未提交程式；本輪按已保存的契約重建。來源保存在 `feat/convelta-abc-20261114`，開發草稿 [PR #11](https://github.com/kieran97125/growthos-crm/pull/11)，總工作卡 [issue #10](https://github.com/kieran97125/growthos-crm/issues/10)。先前的 [恢復紀錄](convelta-abc-recovery-20261114.md) 保留為歷史，不代表其中舊路徑的程式仍存在。

## 交付狀態

| 範圍 | 目前狀態 |
|---|---|
| A2 員工邀請、接受、角色及品牌／產品權限 | 角色／品牌／產品權限、停用／復原及紀錄已發布；正式 Auth 郵件接受仍未驗收，寄信開關維持關閉。 |
| A3 所需專業套件 | Workflow、測試工具、Web Push、Recharts 已固定版本及 lockfile；持久工作執行器尚未重建。安裝不代表功能完成。 |
| A1、A3–A5、B1–B4、C1–C4 | 按原有功能卡繼續；本輪不計完成。合計仍是已授權的 13 工作包。 |
| 正式工作台 | 已發布 `f5682878742697aa52cf2a5309b51f355ea16424`，部署 `dpl_3VPZTuN3tSGfQw6gQgGZqLUKKRky` 為 READY。兩項 additive migration 已套用並核對原文雜湊。 |
| 真實外部動作 | 沒有發送邀請、客戶訊息、通知、廣告轉化或模型請求。測試資料只存在隔離測試環境。 |

## A2 使用體驗

設定入口連到「同事與權限」，主要操作是「邀請同事」「管理權限」。預設畫面顯示成員、使用／預留席位及待接受邀請；品牌範圍與權限歷史按需要展開。Owner 管理權限，Manager 可查看名冊；Owner 本人的復原路徑受到保護。系統工作卡改為可展開，減少設定頁的干擾。

邀請、郵件提交及實際接受分開顯示。失去回應時保留原指令及 UUID，讓使用者重試同一操作；郵件提交結果不明不會自動再寄。修改權限採版本檢查，停用之後保留歷史同事名稱及責任紀錄。

## 權限與資料契約

- 每次 API 使用已驗證的 Auth 身份及資料庫儲存的會員權限；公司購買與個別成員產品權限取交集。`brand_ids = null` 表示全部品牌，明確陣列表示指定品牌；新邀請的產品範圍必須明確指定。
- 更新、接受及重試在資料庫鎖內重查公司、角色、產品、品牌、席位及版本。舊邀請不能覆蓋其後的停用／權限修改，Owner 不會被自助指令降權。
- 收件匣、客戶、跟進、知識庫、AI、POS、帳簿與歷史讀模型均使用當下範圍；篩選在分頁、計數及聚合之前完成。共用客戶的全域資料修改需要所有受影響品牌權限。
- 客戶端只收到有權的投影；伺服器以完整文件執行型別化指令，再核對不能修改的品牌／產品投影，避免受限成員的操作擦掉其他品牌資料。預約轉換同樣使用完整伺服器文件，並只提供有權品牌的選項及服務同事。
- C 的答案可能綜合多個品牌／產品。新增不可變 evidence-scope 帳本保存請求當時可用的範圍；收窄權限後，相關歷史、草稿、記憶及重播都重新核對。舊答案沒有足夠範圍證據時採保守讀取規則，不假定顯示品牌等於全部資料來源。
- 邀請 nonce 以公司及 command ID 分域產生，SQL 只保存 hash。接受端驗證確認電郵及 access/refresh session 的同一身份，再做 SQL 授權，成功後才安裝 httpOnly session。瀏覽器不能指定接受者、角色或授權內容。回跳頁會移除網址中的憑證。
- 新表開啟 RLS，原表不開放瀏覽器角色；RPC 使用 invoker 與空 search path，只供伺服器角色執行。指令、權限歷史及 AI 範圍證據不可覆寫或 truncate。

## Migration 與來源

以下 migration 已套用正式資料庫；來源檔名已按平台實際版本對齊，SQL 原文保持不變：

1. `20261114170223_convelta_abc_member_lifecycle.sql`
2. `20261114170356_convelta_abc_scoped_operations.sql`

第二個 migration 是明確的 SQL 函式定義，從本專案原有 migration 產生；`scripts/build-abc-scopes.mjs` 會核對每個修改錨點，`scripts/abc-scope-header.sql` 保存新增共用契約。正式資料庫不執行程式文字改寫。再生後必須重跑資料庫及權限測試。

## 郵件接通條件

`SMARTVOLT_INVITATIONS_ENABLED` 預設關閉。開啟前需核對正式 HTTPS App origin、Auth redirect allowlist、郵件傳送設定及指定測試郵箱。回跳 `/auth/invite` 的邀請 ID、nonce 及 Auth fragment 必須完整回傳並通過實際接受測試。

邀請簽章可使用獨立 32-byte base64 `SMARTVOLT_INVITATION_KEY`；未另設時沿用既有伺服器加密 key。key 只放伺服器環境，不能交到前端、工作卡或文件。已有帳戶的郵件以 `shouldCreateUser: false` 登入，不另造帳戶。`submitted` 只代表 Auth 服務接受提交，不代表已送達或已接受邀請。

未提供真實接收人，因此此輪只驗證隔離 API 邊界；沒有自行向 Owner 或客戶寄測試信。這項正式接通驗收保留在 `staff-invitations` 卡。

## 已取得的證據

候選 `f317315da8b0bbd931c5f058716970b23670763a` 的 [CI 43615013559](https://github.com/kieran97125/growthos-crm/actions/runs/43615013559) 已通過 typecheck、lint、287 項程式／資料庫、108 項瀏覽器、四項首屏，以及原生 PostgreSQL 併發驗證。108 項包括新增五項成員介面檢查：桌面、手機、鍵盤／可存取性、遺失回應重試、Manager 唯讀及郵件未設定情況。

瀏覽器 artifact `14122415921` 的 SHA256 為 `22df652a91d64c93e62e87bf83485e3c9ee61c9a14b004b18788876046c8e746`，已核對並檢視桌面／手機截圖。視覺檢查後補齊主要按鈕及 Convelta 藍色樣式，並加入總覽截圖。其後亦補強 POS 轉換、服務同事資格、渠道設定品牌檢查及明確郵件啟用開關；最終差異已由 `f568287` 的 CI 43616362481 驗證：293 項程式／資料庫、108 項瀏覽器、四項首屏與原生 PostgreSQL 全數通過。

本地整體已通過 293 項程式／資料庫檢查；其中包含 15 項新增權限／生命週期情境及六項邀請服務邊界情境。後續範圍修正另有 52 項資料庫回歸通過。最終 typecheck、lint、資料庫及 hosted browser 的結果應以 PR 最新 commit 為準。本地 Chromium 因執行環境拒絕 process-singleton socket 而不能啟動，沒有把本地啟動失敗算作瀏覽器通過。

## 下一步

1. A2 權限核心、正式登入後名冊、設定入口、收合工作卡及重新載入已驗收。保留 A2 正式 Auth 郵件／指定郵箱接受驗收；沒有發出真實邀請。
2. 重建 A3/A4 的持久 outbox、資格／用途／同意、限速、取消及不明結果核對，再接 B1–B3 的正式範本、受眾和旅程。Workflow 只決定何時喚醒，SQL 決定當下能否執行；供應商結果不明不能自動重發。
3. B4/C1/C2 接背景通知、漏覆／同時回覆、更表／休假／技能；C3 使用完整聚合及獨立事件／cohort 口徑；C4 維持原始廣告來源與實際業務結果的權威邊界。
4. A1 逐渠道驗收；A5 交接 Convelta 自家網站真實 enquiry。渠道接通、供應商接受、送達及業務結果分開記錄。所有未完成項目沿用原工作卡。

## Product Learning Sync checked

已從 canonical protocol、index、main checkpoint 及 draft review proposal 查核，採用中立契約：

- `2026-07-26-whatsapp-broadcast-operations-boundary.md`
- `2026-07-29-connector-readiness-and-identity-boundary.md`
- `2026-07-31-master-owned-member-invitation-lifecycle.md`
- `2026-08-10-permission-aware-aggregate-brand-scope.md`
- `2026-10-06-optional-operator-settings.md`
- `2026-10-15-brand-owned-financial-dashboards.md`
- `2026-08-03-brand-owned-conversion-destination.md`
- `2026-11-11-account-owned-report-segments.md`

Canonical checkpoint 透過既有 draft PR #88 記錄 A2 權限核心的發布證據；未代表完整 ABC 完成或該 review proposal 已合併。沒有匯入試點身份、客戶、原始資料、憑證、價格、網域或實作程式。
