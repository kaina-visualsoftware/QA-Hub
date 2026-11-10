-- Disposable fixture only; never run in production.
create role anon;create role authenticated;
create schema auth;create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth,storage to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
create table auth.users(id uuid primary key);
create table public.qa_tarefas(id uuid primary key,user_id uuid,titulo text,publica boolean);
grant select on public.qa_tarefas to authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to anon,authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
create table public.qa_referencias(id uuid primary key default gen_random_uuid(),user_id uuid,categoria text,titulo text,conteudo text check(length(conteudo) between 3 and 2000),created_at timestamptz default now());
alter table public.qa_referencias enable row level security;
grant select,insert,delete on public.qa_referencias to authenticated;
create policy qa_referencias_read on public.qa_referencias for select to authenticated using(user_id=auth.uid());
create policy qa_referencias_delete on public.qa_referencias for delete to authenticated using(user_id=auth.uid());
create function public.qa_test_assert(ok boolean, label text) returns void language plpgsql as $$begin if ok is not true then raise exception '%',label; end if;end$$;

insert into public.qa_referencias(id,user_id,categoria,titulo,conteudo) values('99999999-9999-4999-8999-999999999999','99999999-9999-4999-8999-999999999998','nota','Nota existente','Texto anterior à migração');
