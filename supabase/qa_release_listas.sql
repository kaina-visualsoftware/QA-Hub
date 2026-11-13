-- Catálogo de nomes para organizar releases. Nenhum texto de TF é armazenado.
-- Instalação via migração no projeto Supabase SIA.
create table if not exists public.qa_release_listas (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 nome text not null check (char_length(btrim(nome)) between 2 and 90),
 escopo text not null check (escopo in ('pessoal','equipe','global')),
 equipe_id uuid references public.qa_equipes(id) on delete cascade,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint qa_release_listas_escopo_equipe check (
  (escopo = 'equipe' and equipe_id is not null)
  or (escopo <> 'equipe' and equipe_id is null)
 )
);
create index if not exists qa_release_listas_owner_idx on public.qa_release_listas(owner_id);
create index if not exists qa_release_listas_equipe_idx on public.qa_release_listas(equipe_id) where equipe_id is not null;
create index if not exists qa_release_listas_escopo_idx on public.qa_release_listas(escopo);
create table if not exists public.qa_release_lista_itens (
 id uuid primary key default gen_random_uuid(),
 lista_id uuid not null references public.qa_release_listas(id) on delete cascade,
 nome text not null check (char_length(btrim(nome)) between 2 and 90),
 ordem integer not null default 0 check (ordem between 0 and 10000),
 ativo boolean not null default true,
 created_at timestamptz not null default now()
);
create unique index if not exists qa_release_lista_itens_nome_ci
 on public.qa_release_lista_itens(lista_id, lower(btrim(nome)));
create index if not exists qa_release_lista_itens_ordem_idx
 on public.qa_release_lista_itens(lista_id,ordem,id);

create or replace function public.qa_release_lista_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.owner_id is distinct from old.owner_id
  or new.escopo is distinct from old.escopo
  or new.equipe_id is distinct from old.equipe_id then
   raise exception 'Não é permitido transferir listas ou alterar o escopo. Crie uma nova lista.'
    using errcode='23514';
 end if;
 return new;
end;
$$;
drop trigger if exists qa_release_lista_guard_update on public.qa_release_listas;
create trigger qa_release_lista_guard_update before update on public.qa_release_listas
 for each row execute function public.qa_release_lista_guard();

alter table public.qa_release_listas enable row level security;
alter table public.qa_release_lista_itens enable row level security;

create policy qa_release_listas_read on public.qa_release_listas
 for select to authenticated using (
  owner_id = (select auth.uid())
  or escopo = 'global'
  or (escopo = 'equipe' and qa_private.f5_team_member(equipe_id))
);
create policy qa_release_listas_insert on public.qa_release_listas
 for insert to authenticated with check (
  owner_id = (select auth.uid()) and
  (escopo = 'pessoal'
   or (escopo = 'equipe' and exists (
    select 1 from public.qa_equipes t
     where t.id = equipe_id and t.owner_id = (select auth.uid())
   ))
   or (escopo = 'global' and exists (
    select 1 from public.qa_admins a where a.user_id=(select auth.uid())
   )))
);
create policy qa_release_listas_edit on public.qa_release_listas
 for update to authenticated
 using (
  (owner_id=(select auth.uid()) and
   (escopo='pessoal' or (escopo='equipe' and exists (
    select 1 from public.qa_equipes t
     where t.id=equipe_id and t.owner_id=(select auth.uid())
   ))))
  or (escopo='global' and exists (
   select 1 from public.qa_admins a where a.user_id=(select auth.uid())
  ))
 )
 with check (
  (owner_id=(select auth.uid()) and
   (escopo='pessoal' or (escopo='equipe' and exists (
    select 1 from public.qa_equipes t
     where t.id=equipe_id and t.owner_id=(select auth.uid())
   ))))
  or (escopo='global' and exists (
   select 1 from public.qa_admins a where a.user_id=(select auth.uid())
  ))
 );
create policy qa_release_listas_delete on public.qa_release_listas
 for delete to authenticated using (
  (owner_id=(select auth.uid()) and
   (escopo='pessoal' or (escopo='equipe' and exists (
    select 1 from public.qa_equipes t
     where t.id=equipe_id and t.owner_id=(select auth.uid())
   ))))
  or (escopo='global' and exists (
   select 1 from public.qa_admins a where a.user_id=(select auth.uid())
  ))
 );

-- Os itens herdam visibilidade da lista; não são expostos por ID isolado.
create policy qa_release_lista_itens_read on public.qa_release_lista_itens
 for select to authenticated using (
  exists (select 1 from public.qa_release_listas l where l.id=lista_id)
 );
create policy qa_release_lista_itens_insert on public.qa_release_lista_itens
 for insert to authenticated with check (
  exists (select 1 from public.qa_release_listas l where l.id=lista_id and
   ((l.owner_id=(select auth.uid()) and
      (l.escopo='pessoal' or (l.escopo='equipe' and exists (
       select 1 from public.qa_equipes t
       where t.id=l.equipe_id and t.owner_id=(select auth.uid())
      ))))
    or (l.escopo='global' and exists (
      select 1 from public.qa_admins a where a.user_id=(select auth.uid())
    ))))
 );
create policy qa_release_lista_itens_update on public.qa_release_lista_itens
 for update to authenticated
 using (exists (select 1 from public.qa_release_listas l where l.id=lista_id and
  ((l.owner_id=(select auth.uid()) and
     (l.escopo='pessoal' or (l.escopo='equipe' and exists (
      select 1 from public.qa_equipes t where t.id=l.equipe_id and t.owner_id=(select auth.uid())
     ))))
   or (l.escopo='global' and exists (
    select 1 from public.qa_admins a where a.user_id=(select auth.uid())
   )))))
 with check (exists (select 1 from public.qa_release_listas l where l.id=lista_id and
  ((l.owner_id=(select auth.uid()) and
     (l.escopo='pessoal' or (l.escopo='equipe' and exists (
      select 1 from public.qa_equipes t where t.id=l.equipe_id and t.owner_id=(select auth.uid())
     ))))
   or (l.escopo='global' and exists (
    select 1 from public.qa_admins a where a.user_id=(select auth.uid())
   )))));
create policy qa_release_lista_itens_delete on public.qa_release_lista_itens
 for delete to authenticated using (exists (
  select 1 from public.qa_release_listas l where l.id=lista_id and
  ((l.owner_id=(select auth.uid()) and
     (l.escopo='pessoal' or (l.escopo='equipe' and exists (
      select 1 from public.qa_equipes t where t.id=l.equipe_id and t.owner_id=(select auth.uid())
     ))))
   or (l.escopo='global' and exists (
    select 1 from public.qa_admins a where a.user_id=(select auth.uid())
   )))
 ));

revoke all on table public.qa_release_listas,public.qa_release_lista_itens from anon;
grant select,insert,update,delete on table public.qa_release_listas,public.qa_release_lista_itens to authenticated;
