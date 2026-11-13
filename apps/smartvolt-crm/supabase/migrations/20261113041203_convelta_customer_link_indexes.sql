-- Cover the customer-brand references used by link verification and booking handoff.
-- Separate migration preserves the already installed inquiry migration verbatim.
create index sv_customer_threads_brand_link
  on public.sv_customer_threads(company_id, customer_id, brand_id);
create index sv_booking_requests_brand_link
  on public.sv_booking_requests(company_id, customer_id, brand_id);
