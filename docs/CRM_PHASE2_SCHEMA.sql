-- LeadOps CRM Phase 2 schema proposal.
-- Planning file only. Do not assume this has been applied to Supabase.
-- Current LaunchHub identity: brand_slug + normalized_phone.
-- Future GrowthOS identity: tenant_id + brand_id + normalized_phone.

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  brand_slug text not null,
  normalized_phone text not null,
  display_name text null,
  email text null,
  first_seen_at timestamptz null,
  last_activity_at timestamptz null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_contacts_brand_phone_unique unique (brand_slug, normalized_phone)
);

create index if not exists crm_contacts_tenant_brand_phone_idx
  on public.crm_contacts (tenant_id, brand_slug, normalized_phone);

create table if not exists public.crm_lead_cases (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  source_lead_id uuid null references public.leads(id) on delete set null,
  brand_slug text not null,
  status text not null default 'new',
  assigned_to text null,
  treatment_label text null,
  offer_label text null,
  source_type text not null default 'unknown',
  source_label text null,
  landing_page_slug text null,
  page_url text null,
  form_token text null,
  utm_source text null,
  utm_campaign text null,
  ctwa_source_id text null,
  ctwa_source_url text null,
  ctwa_referral_headline text null,
  ctwa_referral_body text null,
  campaign_id text null,
  adset_id text null,
  ad_id text null,
  phone_number_id text null,
  whatsapp_business_account_id text null,
  next_follow_up_at timestamptz null,
  booking_id uuid null,
  lost_reason text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_lead_cases_status_check
    check (status in (
      'new',
      'contacting',
      'booked',
      'confirmed',
      'showed',
      'paid',
      'no_show',
      'lost',
      'invalid'
    )),
  constraint crm_lead_cases_source_type_check
    check (source_type in (
      'landing_form',
      'whatsapp_ad',
      'whatsapp_direct',
      'manual',
      'import',
      'unknown'
    ))
);

create index if not exists crm_lead_cases_contact_idx
  on public.crm_lead_cases (contact_id, updated_at desc);

create index if not exists crm_lead_cases_brand_status_idx
  on public.crm_lead_cases (brand_slug, status, updated_at desc);

create table if not exists public.crm_interactions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_lead_cases(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  interaction_type text not null,
  direction text null,
  body text null,
  author text null,
  source_type text null,
  external_message_id text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint crm_interactions_type_check
    check (interaction_type in (
      'note',
      'status_change',
      'whatsapp_inbound',
      'whatsapp_outbound',
      'call',
      'booking',
      'system'
    )),
  constraint crm_interactions_direction_check
    check (direction is null or direction in ('inbound', 'outbound', 'internal'))
);

create index if not exists crm_interactions_case_created_idx
  on public.crm_interactions (case_id, created_at desc);

create table if not exists public.crm_status_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_lead_cases(id) on delete cascade,
  previous_status text null,
  new_status text not null,
  changed_by text null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists crm_status_history_case_created_idx
  on public.crm_status_history (case_id, created_at desc);

create table if not exists public.crm_bookings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_lead_cases(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  brand_slug text not null,
  branch_label text null,
  treatment_label text null,
  booking_date date null,
  booking_time time null,
  status text not null default 'tentative',
  created_by text null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_bookings_status_check
    check (status in (
      'tentative',
      'booked',
      'confirmed',
      'showed',
      'no_show',
      'cancelled'
    ))
);

create index if not exists crm_bookings_case_idx
  on public.crm_bookings (case_id, created_at desc);

create table if not exists public.crm_follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_lead_cases(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  assigned_to text null,
  due_at timestamptz null,
  task_type text null,
  note text null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_follow_up_tasks_status_check
    check (status in ('open', 'done', 'cancelled'))
);

create index if not exists crm_follow_up_tasks_due_idx
  on public.crm_follow_up_tasks (status, due_at asc);

create table if not exists public.crm_quick_replies (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null,
  title text not null,
  category text null,
  body text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_brand_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null,
  title text not null,
  category text null,
  content text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null,
  brand_slug text not null,
  provider text not null default 'meta_whatsapp_cloud_api',
  waba_id text null,
  phone_number_id text null,
  display_phone_number text null,
  business_account_id text null,
  access_token_secret_ref text null,
  webhook_verify_token_hash text null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_channels_status_check
    check (status in ('draft', 'pending_verification', 'active', 'paused', 'disabled'))
);

create index if not exists whatsapp_channels_brand_idx
  on public.whatsapp_channels (brand_slug, status);

create table if not exists public.whatsapp_message_templates (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.whatsapp_channels(id) on delete cascade,
  brand_slug text not null,
  template_name text not null,
  language text not null,
  category text null,
  status text not null default 'draft',
  components_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid null references public.whatsapp_channels(id) on delete set null,
  brand_slug text null,
  event_type text not null,
  external_message_id text null,
  normalized_phone text null,
  payload_json jsonb not null,
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_processing_idx
  on public.whatsapp_webhook_events (processed_at, created_at desc);

-- Security notes:
-- 1. Store only access_token_secret_ref, never raw WhatsApp access tokens.
-- 2. Store only webhook_verify_token_hash, never raw verify tokens.
-- 3. Do not enable CRM write actions until application-level authorization and RLS policies are reviewed.
-- 4. Future GrowthOS should add a tenant_id + brand_id + normalized_phone uniqueness constraint.
