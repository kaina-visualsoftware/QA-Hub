-- Quota de uso da IA para evitar custos/abuso de endpoints públicos.
-- Verificação de JWT é feita pela plataforma e também pela Edge Function.
create table if not exists public.qa_ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default (now() at time zone 'UTC')::date,
  request_count integer not null default 0 check (request_count between 0 and 12),
  last_request_at timestamptz not null default now(),
  primary key(user_id, usage_date)
);
alter table public.qa_ai_daily_usage enable row level security;
revoke all on public.qa_ai_daily_usage from public, anon, authenticated;

create or replace function public.qa_ai_claim_request()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  requestor uuid := (select auth.uid());
  accepted boolean := false;
begin
  if requestor is null then return false; end if;
  insert into public.qa_ai_daily_usage(user_id, usage_date, request_count, last_request_at)
  values(requestor, (now() at time zone 'UTC')::date, 1, now())
  on conflict(user_id,usage_date) do update
  set request_count = public.qa_ai_daily_usage.request_count + 1,
      last_request_at = now()
  where public.qa_ai_daily_usage.request_count < 12
    and public.qa_ai_daily_usage.last_request_at < now() - interval '15 seconds'
  returning true into accepted;
  return coalesce(accepted,false);
end;
$$;
revoke all on function public.qa_ai_claim_request() from public, anon;
grant execute on function public.qa_ai_claim_request() to authenticated;
