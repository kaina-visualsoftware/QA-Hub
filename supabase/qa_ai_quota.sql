-- NVIDIA Build quota (shared API key): maximum 15 upstream requests in any rolling
-- 60-second window, with NO daily cap. Apply via Supabase migration before Edge deploy.
-- Existing qa_ai_daily_usage remains as historical data; it is not consulted.
create table if not exists public.qa_ai_minute_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index if not exists qa_ai_minute_requests_requested_at_idx
  on public.qa_ai_minute_requests(requested_at);
alter table public.qa_ai_minute_requests enable row level security;
revoke all on public.qa_ai_minute_requests from public, anon, authenticated;

-- The advisory transaction lock serializes claims across all application users
-- because all NVIDIA requests share the SAME server-side API key. The table is
-- private; authenticated users can only claim through this guarded RPC.
create or replace function public.qa_ai_claim_minute_request()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requestor uuid := (select auth.uid());
  at_time timestamptz;
  count_recent integer;
  first_request timestamptz;
  wait_seconds integer;
begin
  if requestor is null then
    return jsonb_build_object('allowed',false,'error','unauthorized');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(24051, 15001);
  at_time := clock_timestamp();

  -- Reclaim only records older than the *sliding* one-minute window.
  delete from public.qa_ai_minute_requests
  where requested_at <= at_time - interval '60 seconds';

  select count(*)::integer, min(requested_at)
    into count_recent, first_request
  from public.qa_ai_minute_requests
  where requested_at > at_time - interval '60 seconds';

  if count_recent >= 15 then
    wait_seconds := greatest(1, ceil(extract(epoch from
      (first_request + interval '60 seconds' - at_time)))::integer);
    return jsonb_build_object(
      'allowed',false,'error','rate_limited',
      'limit',15,'window_seconds',60,'remaining',0,
      'retry_after_seconds',wait_seconds
    );
  end if;

  insert into public.qa_ai_minute_requests (user_id,requested_at)
    values (requestor,at_time);
  return jsonb_build_object(
    'allowed',true,'limit',15,'window_seconds',60,
    'remaining',14-count_recent,'retry_after_seconds',0
  );
end;
$$;
revoke all on function public.qa_ai_claim_minute_request() from public, anon;
grant execute on function public.qa_ai_claim_minute_request() to authenticated;

-- Keep compatibility for any older deployed Edge versions: this RPC no longer
-- reads or increments the daily usage table.
create or replace function public.qa_ai_claim_request()
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select coalesce((public.qa_ai_claim_minute_request()->>'allowed')::boolean,false);
$$;
revoke all on function public.qa_ai_claim_request() from public, anon;
grant execute on function public.qa_ai_claim_request() to authenticated;
