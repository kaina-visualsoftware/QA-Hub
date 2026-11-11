-- Preserve credential protection without blocking SQL examples and schema declarations.
-- Never make the private documentation bucket public.
begin;
alter table public.qa_referencias drop constraint if exists qa_referencias_sem_credenciais;
alter table public.qa_referencias add constraint qa_referencias_sem_credenciais
 check (
  (titulo || E'\n' || conteudo) !~*
   '(^|[^[:alnum:]_])(senha|password|token|secret|api[ _-]?key|bearer|authorization)[[:space:]]*[:=][[:space:]]*[''"]?[A-Za-z0-9_+\/=-]{24,}'
  and (titulo || E'\n' || conteudo) !~
   '(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{10,})'
 );
update storage.buckets set public=false,
 allowed_mime_types=array(
  select distinct mime from unnest(coalesce(allowed_mime_types,'{}'::text[])||
   array['application/json','application/x-zip-compressed','application/sql','text/x-sql',
         'application/x-sql','application/xml','text/xml']) as mime
 )
where id='qa-documentacoes';
commit;
