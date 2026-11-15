-- Real operational acceptance remains distinct from deployed capabilities.
create function smartvolt_private.seed_customer_intelligence_roadmap(p_company uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.sv_system_cards(company_id,id,title,category,status,detail) values
 (p_company,'memory-live-acceptance','客戶記憶真實案例驗收','crm','blocked','待有已核實客戶及來源對話，驗收跨渠道時間線、記憶更正、後續 AI 草稿及身份改連結後的隔離；不以合成資料冒充真實客戶使用。沿用工作卡 #12。'),
 (p_company,'segments-live-acceptance','自動分眾真實入退組驗收','crm','blocked','待公司真實客戶、行為及核實結果，觀察實際自動入組／退出與時間條件；推播仍須獨立同意、渠道及實際送達驗收，不因分眾存在而自動啟用發送。沿用工作卡 #12。'),
 (p_company,'voice-live-acceptance','粵英原音及轉錄品質驗收','ai','blocked','待已授權原音，核對粵語、英語及混合語音的逐字稿、數字／日期、需求摘要及人工更正；模型配置或合成測試不代表真實語音品質已驗證。沿用工作卡 #12。')
 on conflict(company_id,id) do nothing;
end;$$;
revoke all on function smartvolt_private.seed_customer_intelligence_roadmap(uuid) from public,anon,authenticated;
grant execute on function smartvolt_private.seed_customer_intelligence_roadmap(uuid) to service_role;
create function smartvolt_private.company_customer_intelligence_roadmap()
returns trigger language plpgsql security invoker set search_path='' as $$
begin perform smartvolt_private.seed_customer_intelligence_roadmap(new.id);return new;end;$$;
revoke all on function smartvolt_private.company_customer_intelligence_roadmap() from public,anon,authenticated;
create trigger sv_company_customer_intelligence_roadmap after insert on public.sv_companies
for each row execute function smartvolt_private.company_customer_intelligence_roadmap();
select smartvolt_private.seed_customer_intelligence_roadmap(id) from public.sv_companies;
