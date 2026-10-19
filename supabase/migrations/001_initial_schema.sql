-- ============================================================
-- PayPal Merchant Dispute Copilot — initial schema
-- Apply with: supabase db push  (or paste into the SQL editor)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- disputes: one row per PayPal dispute / chargeback case
-- ------------------------------------------------------------
create table if not exists public.disputes (
  id                   uuid primary key default gen_random_uuid(),
  paypal_dispute_id    text unique not null,
  dispute_amount       numeric not null default 0,
  currency             varchar(3) not null default 'USD',
  dispute_reason       text not null,
  status               text not null default 'REQUIRED_ACTION',
  reply_by_date        timestamptz,
  ai_confidence_score  integer check (ai_confidence_score between 0 and 100),
  ai_suggested_evidence jsonb,
  customer_name        text,
  customer_email       text,
  -- "Key Evidence" preview + supporting facts (tracking, carrier, IP/device match).
  key_evidence         jsonb,
  merchant_submitted   boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.disputes is
  'PayPal disputes ingested from webhooks or seed data. status: REQUIRED_ACTION | UNDER_REVIEW | RESOLVED.';

create index if not exists disputes_status_idx on public.disputes (status);
create index if not exists disputes_reply_by_date_idx on public.disputes (reply_by_date);
create index if not exists disputes_created_at_idx on public.disputes (created_at desc);

-- ------------------------------------------------------------
-- dispute_audit_logs: legal & compliance audit trail
-- ------------------------------------------------------------
create table if not exists public.dispute_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  dispute_id  uuid not null references public.disputes (id) on delete cascade,
  action      text not null,
  actor       text not null,
  payload     jsonb not null default '{}'::jsonb,
  timestamp   timestamptz not null default now()
);

comment on table public.dispute_audit_logs is
  'Append-only audit trail. action: WEBHOOK_RECEIVED | AI_DRAFT_GENERATED | MERCHANT_APPROVED | SUBMITTED_TO_PAYPAL | DRAFT_SAVED. actor: SYSTEM | AI_COPILOT | MERCHANT_USER.';

create index if not exists dispute_audit_logs_dispute_id_idx
  on public.dispute_audit_logs (dispute_id);
create index if not exists dispute_audit_logs_timestamp_idx
  on public.dispute_audit_logs (timestamp desc);

-- ------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists disputes_set_updated_at on public.disputes;
create trigger disputes_set_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- Row locking level security: no anon/user access, service role only.
-- The backend reads/writes with SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- ------------------------------------------------------------
alter table public.disputes enable row level security;
alter table public.dispute_audit_logs enable row level security;

-- No policies on purpose: with RLS enabled and zero policies,
-- only the service role (backend) can touch these tables.
revoke all on public.disputes from anon, public;
revoke all on public.dispute_audit_logs from anon, public;