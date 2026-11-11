-- Disposable RLS fixture, never production.
-- SQL schema examples containing credential field names are not secrets.
insert into public.qa_referencias(id,user_id,categoria,titulo,conteudo)
values('77777777-7777-4777-8777-777777777777',
 '11111111-1111-4111-8111-111111111111','nota','Manual SQL',
 E'## Exemplo SQL\n\n```sql\nCREATE TABLE sample (token text, password text);\nSELECT token := 1;\n```');
select public.qa_test_assert(
 (select conteudo like '%password text%' from public.qa_referencias where id='77777777-7777-4777-8777-777777777777'),
 'SQL example was not preserved');
-- A credential-shaped assignment is still rejected at database level.
do $check$
begin
 begin
  update public.qa_referencias
     set conteudo='Authorization: '||repeat('a',40)
   where id='77777777-7777-4777-8777-777777777777';
  raise exception 'Real credential-shaped value was unexpectedly accepted';
 exception when check_violation then null;
 end;
end
$check$;
select public.qa_test_assert((select not public from storage.buckets where id='qa-documentacoes'),'Documentation bucket must stay private');
select public.qa_test_assert((select 'application/sql'=any(allowed_mime_types) from storage.buckets where id='qa-documentacoes'),'SQL upload MIME missing');
delete from public.qa_referencias where id='77777777-7777-4777-8777-777777777777';
