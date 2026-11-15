# Convelta 4–6 正式發布與驗收

日期：2026-11-15（香港時間）。狀態：**4–6 程式已正式上線**，完整 CI、正式資料庫及發布後公開入口檢查通過；Owner 已核對實際分眾管理／編輯入口及重載。真實客戶記憶、分眾營運成效及原音轉錄品質仍待各自 live acceptance，不以程式上線當成全部真實驗收完成。

## 正式部署

| 項目 | 已核實結果 |
| --- | --- |
| 正式網址 | [app.convelta.io](https://app.convelta.io) |
| 狀態／READY 時間 | READY；2026-11-15 23:27:49 HKT |
| Deployment | `dpl_7Ynx3VntUM8nu4rxRw1pGm65Nokk` |
| Runtime commit | `64f352bc31293be112847f4052db4dd341fc0daa`，本次明確批准及已完整驗收的候選 |
| Runtime `src` tree | `00bed2b7116aa8c5d23d293a942c84e1f69a4c2f` |
| Alias | `app.convelta.io` 已核對指向本次部署 |

## 已發布候選與 CI

候選 `64f352bc31293be112847f4052db4dd341fc0daa`；[PR #14](https://github.com/kieran97125/growthos-crm/pull/14)。Runtime `src` tree：`00bed2b7116aa8c5d23d293a942c84e1f69a4c2f`。後續 migration 檔名對齊及本文件只記錄相同候選／SQL，不改產品程式、依賴、Next 或排程設定。

- [Convelta CI 43725308958](https://github.com/kieran97125/growthos-crm/actions/runs/43725308958)：434 單元／資料庫、2 Workflow、4 首屏／重載、181 瀏覽器全部通過（8 推播、20 教練／AI、33 記憶／分眾／語音、120 其他 CRM）。Native PostgreSQL operations 亦成功。
- [原 CRM CI 43725308847](https://github.com/kieran97125/growthos-crm/actions/runs/43725308847) 成功。
- 部署前文件 head `41e3be2b57e1a0e7d20a659ba5e467d836239afe` 的 [Convelta CI 43726854264](https://github.com/kieran97125/growthos-crm/actions/runs/43726854264)（verify／postgres-operations，23:02:21 HKT 完成）及 [原 CRM CI 43726854283](https://github.com/kieran97125/growthos-crm/actions/runs/43726854283)（acceptance，22:56:19 HKT 完成）亦全部成功。對比已發布64f352b，只有兩份文件及分眾 SQL 檔名對齊（R100）；runtime、依賴及設定不變，`src` tree 相同。SQL 原文同一 blob `2d0489efd14a54383ea1b8b27b0988744621c0c4`、MD5 `e1c3e06a2dac47712534bc4c6e42ca58`。
- 原推播定位、分眾虛擬時間輪詢及舊收件匣 CSS fixture 問題均已修正；沒有跳過案例、移除保護斷言或放寬期限。
- Artifact `14166233313`，SHA256 `821d89ab01da9bcbd6a2b17f2d7969be1f12e5bb987afce22a3d27244ef18242`。同一 runtime src 的桌面／手機記憶、分眾、語音截圖已檢視。

## 正式資料庫

| Migration | SQL MD5 |
| --- | --- |
| 20261115105954_convelta_voice_transcription | 313acffae8439b2068f357f9ca963027 |
| 20261115110743_convelta_customer_memory | 1e064ecf38d6e31131582eec75231f4e |
| 20261115111809_convelta_completed_draft_freshness | b9051bf5d08721d7ff1899675a35b952 |
| 20261115112412_convelta_customer_intelligence_roadmap | f03d0fda2dbff07aa35c2601a76b5140 |
| 20261115144827_convelta_dynamic_segments | e1c3e06a2dac47712534bc4c6e42ca58 |

全部已安裝及來源原文 MD5 一致。分眾原始來源檔名104028已對齊平台實際144827；SQL內容不變。

完整 `verify-customer-intelligence-hosted.ts` 原生 BEGIN/ROLLBACK 成功：記憶修正及過時脈絡、語音防重／共用配額／原文更正、分眾當下資格與背景入退組。9 張新表 RLS=true，browser 原表 grants=0，語音 bucket 私有且有大小限制，保留合成公司0。正式 workspace revision仍5，inbox／POS／studio／broadcasts 四部分指紋與安裝前相同。Security WARN項目及數量不變；4張新增server-only表的RLS-no-policy INFO沒有透過放寬權限消除。沒有呼叫付費模型或真實渠道。

## 發布批准與已解除阻塞

先前對既有 Vercel team_ABFsc2eobOQhuSWAAQc4CVtO／project prj_gGZ6T5HEMjNAdhcZNX0x6scQEFg0 提交候選64f352b的production deployment遭 automatic approval review 拒絕，理由為對話先前限制只讀及正式部署會改變運行中的服務。當時沒有改用CLI、檔案上傳、promotion或其他方式繞過。

使用者其後明確指示「Convelta 4–6 正式部署」，本次發布授權已成立；同一原生 create deployment API 接受上述已驗收候選並完成 READY。先前發布批准阻塞已解除。舊 production `3533fc3`／`dpl_BL7n6aDFShYaSqYoHjwfDX4vxdBy` 是本次發布前的歷史版本；目前正式狀態以上方部署表為準。發布技術完成與真實使用驗收分開，不能因部署成功關閉[#12](https://github.com/kieran97125/growthos-crm/issues/12)全部工作。

## 發布後檢查與真人驗收界線

2026-11-15 23:29:15–16 HKT，按實際 route source 選定端點，以無登入 HTTPS GET 核對正式 `app.convelta.io`：

| 公開入口／邊界 | 結果 |
| --- | --- |
| `/login` | 200；Convelta 頁面標題正確 |
| 客戶記憶 GET | 401；要求先登入公司帳戶 |
| 分眾 GET | 401；要求先登入公司帳戶 |
| 語音清單 GET | 401；要求先登入公司帳戶 |
| 私人原音 GET | 401；要求先登入公司帳戶 |
| `/api/internal/maintenance` GET | 404；公開網址隱藏 |

上述 API 使用語法有效的中立識別值，驗證未登入保護；沒有 POST、原音下載、模型執行、客戶資料寫入或外發。

發布後既有授權 Owner profile 已開啟實際 CRM，讀回客戶目錄為空；已從訊息介面開啟「自動分眾」管理器及實際編輯器，核對條件、POS checkbox、自動更新預設啟用及空白草稿停用儲存。未儲存的空白草稿已放棄，重載後仍返回相同實際管理器，無資料寫入。這項證據驗收的是 Owner 入口、編輯介面及重載，不是已建立分眾或真實客群入退組成效。

本次沒有可用真實客戶，因此客戶記憶詳情／時間線尚未取得正式 Owner 真人驗收；沒有可用渠道原音，因此語音實際面板及粵英／混合 ASR 品質亦未驗收。保留 memory-live-acceptance、segments-live-acceptance、voice-live-acceptance。

本次已查看的瀏覽器流程 console error／warn 為0。23:29:37 HKT 查詢過去15分鐘 Vercel production error／fatal logs 為空；只代表該檢查視窗內未見此類記錄，不作持續無錯或真實流量成效保證。沒有付費模型探測、真實渠道訊息、邀請、推播或 Meta 事件。

## 保留界線

真實客戶記憶、分眾及粵英／混合原音品質保留各live-acceptance卡；7報價收訂維持planned。原[#10](https://github.com/kieran97125/growthos-crm/issues/10)渠道、郵件、裝置送達、Meta及成本對帳不因本輪關閉。

私人 customer-memory、dynamic-segments、voice-transcription 及 customer-intelligence-release 程式／發布卡已標記 complete；三張 live-acceptance 卡保持 blocked，chat-payment-links 保持 planned。更新後已讀回核對。

Product Learning Sync checked：fresh canonical protocol/index/checkpoint與相關neutral entries已讀；review proposal#88保留驗收及發布界線，不匯入Enterprise Pilot資料／實作。

既有 reviewed proposal [#88](https://github.com/kieran97125/leadhub-source-os/pull/88) 已於 `533d87f2329a18c2669b106a4b0dda0ebdbefc77` 記錄本次正式發布及仍待真實驗收界線；未合併或改動 canonical 主分支，沒有新的產品採納／分類決策。
