# Convelta 網站聊天窗

日期：2026-11-16 HKT。程式／本機合成驗收已完成；正式 migration、部署與公司實際網站驗證／訪客雙向接待由本輪發布紀錄核實，本文不聲稱已上線或真人驗收完成。

## 已實作

- 每間公司／品牌獨立網站聊天設定；預設停用。名稱、問候、精確 HTTPS 網站及聊天窗代碼由管理員設定。
- 網站所有權可用首頁 meta 標記或 DNS TXT 驗證。首頁讀取沿用既有公開地址驗證及 DNS pinning transport，8 秒／512KB 上限，跨 origin redirect 不作成功；DNS 有短逾時及有限重試。
- 每個聊天窗由獨立 iframe 呈現；CSP nonce script/style、精確 frame-ancestors、固定 postMessage origin/source、無 provider 憑證或訪客 bearer 放在 URL。
- 訪客 session 使用瀏覽器密碼學隨機 token，服務端只保存 SHA256；token 只走 Authorization header，不依賴第三方 cookie。sessionStorage 不可用時，同頁仍可對話；不聲稱該情況下重載可恢復 session。
- 留言及同事回覆寫入正式資料表，原訊息不可由 runtime UPDATE／DELETE；未知發送結果用相同 command 核對，不能改 UUID 重覆派送。
- 真人網站收件匣與原有社交收件匣同一 CRM 入口，由來源切換；保留各對話草稿，手機返回清單、深連結及重載可用。隱藏來源停止輪詢。
- 同事待核對操作使用公司＋當前已驗證 actor 隔離的 sessionStorage journal；重載不自動 POST，原命令及正文保留，核對前停用新操作。storage 被拒時退回記憶，會提示保持頁面。全部四種操作（回覆、結束、重開、連結）沿用同一契約。
- 訪客不因名字、電話或相似資料自動成為／合併客戶。人工搜尋並明確選取同公司同品牌客戶後才建立連結；來源事件追加到客戶紀錄。未連結訪客不借用上一位社交客戶的 C／POS 脈絡。
- 每次讀寫都重驗 CRM 購買、active membership、當前品牌範圍及角色；權限收窄後舊對話與新訊息同樣受限。分頁之前過濾；scopeStamp 亦避免舊分頁快取繼續展示已撤權品牌。
- 訪客過期、聊天窗停用、來源網域撤銷或公司 CRM 停用，禁止新訪客發訊／同事回覆；已結束對話須明確重開。
- session 開立、讀取、留言及同事回覆均有資料庫限流；單對話訊息量有上限，最多 50 條一頁，保留較早紀錄。清理限流 bucket 每次最多 100 行。

## 路由及整合契約

| 用途                      | 路由／檔案                                                   |
| ------------------------- | ------------------------------------------------------------ |
| 公司設定                  | `/company/[companyId]/settings/website-chat`                 |
| 公司設定 API              | `/api/companies/[companyId]/web-chat`                        |
| 同事列表／對話／明確操作  | `/api/companies/[companyId]/web-chat/threads`                |
| 可嵌入程式                | `/embed/chat.js`，`data-convelta-chat` 僅放公開 widget ID    |
| 訪客 iframe               | `/chat/[publicId]?site=<HTTPS origin>`                       |
| 訪客受 session 限制的 API | `/api/chat/[publicId]`，token 僅由 Authorization header 傳入 |
| CRM 真實 component        | `WebChatInbox({companyId,actorId,initialThreadId?,active?})` |

新增四張 server-only 表 `sv_web_chat_configs`、`sv_web_chat_threads`、`sv_web_chat_messages`、`sv_web_chat_limits`；RLS=true，anon／authenticated 原表及 RPC grants=0。所有 RPC 為 security invoker；service_role 原表權限先撤銷再按需列舉，訊息只有 SELECT／INSERT。

本功能專用 endpoints 不構成通用公司 API／外發 Webhook 產品。第 5 項維持押後；付款接駁維持押後及人工核實紀錄。沒有自動啟用 AI、真實外發、付款或其他租戶的網站。

## 驗收

本機 18 個實質 node／PGlite 案例通過：來源驗證、預設停用、token／公司／品牌隔離、權限收窄後歷史、未知結果防重、viewer 拒絕、編輯 revision、防垃圾、過期／停用、明確身份連結、較早分頁、原表權限、nonce／XSS、真實 embed script 語法、actor journal 隔離及 storage 拒絕 fallback。

`e2e/web-chat-widget.spec.ts` 三個 browser 案例使用實際 embed／iframe 程式，覆蓋真人回覆、lost-response 相同命令及手機 composer；收件匣實際 wrapper 的切換／權限／reload journal／延遲歷史回應／axe／版面則由 `e2e/inbox-expansion-integration.spec.ts` 保留。此處僅記錄已建立及可列出，雲端 browser 成功與否以發布 CI 為準；未啟動受環境限制的本機 Chromium。

Product Learning Sync checked：fresh canonical protocol／index／checkpoint `6a80846`／`1080e95`／`e52e473`；已核對 07-17 regression、07-26 broadcast authority、07-29 readiness／identity、08-10 permission-aware brand scope、10-06 description density。只沿用中立驗收及隔離契約，沒有匯入 pilot 資料、實作、身份、價格、網域或憑證；checkpoint 經既有 reviewed proposal 由本輪整合處理。
