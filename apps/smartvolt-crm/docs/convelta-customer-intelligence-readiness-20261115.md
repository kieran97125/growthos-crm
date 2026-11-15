# Convelta 4–6 發布準備與驗收

日期：2026-11-15（香港時間）。狀態：程式、完整 CI 及正式資料庫驗收完成；正式部署遭自動審核拒絕，等待使用者明確批准。**尚未上線**。

## 可發布候選

候選 `64f352bc31293be112847f4052db4dd341fc0daa`；[PR #14](https://github.com/kieran97125/growthos-crm/pull/14)。Runtime `src` tree：`00bed2b7116aa8c5d23d293a942c84e1f69a4c2f`。後續 migration 檔名對齊及本文件只記錄相同候選／SQL，不改產品程式、依賴、Next 或排程設定。

- [Convelta CI 43725308958](https://github.com/kieran97125/growthos-crm/actions/runs/43725308958)：434 單元／資料庫、2 Workflow、4 首屏／重載、181 瀏覽器全部通過（8 推播、20 教練／AI、33 記憶／分眾／語音、120 其他 CRM）。Native PostgreSQL operations 亦成功。
- [原 CRM CI 43725308847](https://github.com/kieran97125/growthos-crm/actions/runs/43725308847) 成功。
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

## 正式發布阻塞

對既有 Vercel team_ABFsc2eobOQhuSWAAQc4CVtO／project prj_gGZ6T5HEMjNAdhcZNX0x6scQEFg0 提交候選64f352b的production deployment遭 automatic approval review 拒絕。回覆理由：對話先前明確限制只讀；正式部署會改變運行中的服務。沒有改用CLI、檔案上傳、promotion或其他方式繞過。

正式仍為 `3533fc3`／READY `dpl_BL7n6aDFShYaSqYoHjwfDX4vxdBy`，app.convelta.io指向一致。待使用者明確批准本次4–6正式部署後，部署上述已驗收候選，再核對READY／alias／未登入及來源邊界／正式Owner入口與reload。保持[#12](https://github.com/kieran97125/growthos-crm/issues/12)及私人`customer-intelligence-release`卡blocked。

## 保留界線

真實客戶記憶、分眾及粵英／混合原音品質保留各live-acceptance卡；7報價收訂維持planned。原[#10](https://github.com/kieran97125/growthos-crm/issues/10)渠道、郵件、裝置送達、Meta及成本對帳不因本輪關閉。

Product Learning Sync checked：fresh canonical protocol/index/checkpoint與相關neutral entries已讀；review proposal#88保留驗收及發布界線，不匯入Enterprise Pilot資料／實作。
