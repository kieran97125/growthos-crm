-- Persistent delivery scope requested 2026-11-15. Planning never closes the
-- existing provider, device, attribution, finance or live-acceptance cards.
create function smartvolt_private.seed_coaching_roadmap(p_company uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.sv_system_cards(company_id,id,title,category,status,detail) values
 (p_company,'coaching-next-action','1 · AI 下一步建議','ai','in_progress','深化既有意向摘要：缺漏資料、下一問、可編輯草稿及原對話依據。由同事操作，不自動發送；部署與驗收證據沿用工作卡 #12。'),
 (p_company,'coaching-quality','2 · 客服質檢與流失原因','ai','in_progress','附原句的回覆改善及暫定顧慮；主管可覆核、更正及保留歷史，不冒充客人 CSAT 或已核實流失。工作卡 #12。'),
 (p_company,'coaching-learning','3 · 品牌成功話術學習','ai','in_progress','來源對話、核實預約結果、Q&A／溝通方式／知識缺口；管理員編輯採用至品牌知識，保留來源和版本，話術與業務事實分開。工作卡 #12。'),
 (p_company,'customer-memory','4 · 客戶長期記憶','crm','planned','已列入後續：可追溯需要、偏好、報價、到店及付款的單一時間線；跨渠道身份經核實才連結。現有目錄不代表本項已完成。'),
 (p_company,'dynamic-segments','5 · 行為分眾自動更新','crm','planned','深化現有基本分眾：按問過未預約、回訪間隔、核實訂金／到店等條件持續入組及退出，接既有推播與旅程；發送仍重驗當下資格。'),
 (p_company,'voice-transcription','6 · 粵英語音轉錄與需求抽取','ai','planned','沿用 wa-media／meta-media 的私有附件底層，加入可核對及修正的逐字稿、療程／日期抽取；未能取得原音時不宣稱已理解。'),
 (p_company,'chat-payment-links','7 · 對話報價與收訂','finance','planned','對話內報價卡、公司收款供應商訂金連結及實際簽名付款回寫；沿用 pos-acquiring，手動登記與開啟付款頁不代表已付款。'),
 (p_company,'coaching-live-acceptance','客服教練真實對話驗收','ai','blocked','程式及合成案例驗收與真實營運成效分開；待已授權渠道／可核實對話與預約來源，核對下一問、主管修正、話術採用及後續實際草稿品質，不填造轉化提升。'),
 (p_company,'coaching-program','客服教練 1–3 與後續 4–7','build','in_progress','2026-11-15 使用者指定先做 1–3；4–7 明確保留後續。整體進度 https://github.com/kieran97125/growthos-crm/issues/12；原 ABC 真實渠道、邀請、裝置送達、Meta 與成本驗收沿用 #10，不因本輪關閉。')
 on conflict(company_id,id) do nothing;
end;$$;
revoke all on function smartvolt_private.seed_coaching_roadmap(uuid) from public,anon,authenticated;
grant execute on function smartvolt_private.seed_coaching_roadmap(uuid) to service_role;
create function smartvolt_private.company_coaching_roadmap()
returns trigger language plpgsql security invoker set search_path='' as $$
begin perform smartvolt_private.seed_coaching_roadmap(new.id);return new;end;$$;
revoke all on function smartvolt_private.company_coaching_roadmap() from public,anon,authenticated;
create trigger sv_company_coaching_roadmap after insert on public.sv_companies
for each row execute function smartvolt_private.company_coaching_roadmap();
select smartvolt_private.seed_coaching_roadmap(id) from public.sv_companies;
