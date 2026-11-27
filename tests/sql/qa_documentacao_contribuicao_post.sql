-- Disposable PostgreSQL fixture only. Never run against a hosted project.
-- Account A owns the public document; account B contributes through the restricted RPC.
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

insert into public.qa_tarefas(id,user_id,titulo,publica)
values (
 '55555555-5555-4555-8555-555555555555',
 '11111111-1111-4111-8111-111111111111',
 'TF privada vinculada ao manual',
 false
);

select public.qa_test_assert(
 not has_table_privilege('anon','public.qa_documentacao_versoes','SELECT'),
 'anonymous users must not read version history'
);
select public.qa_test_assert(
 not has_table_privilege('authenticated','public.qa_documentacao_versoes','INSERT'),
 'clients must not forge version history rows'
);
select public.qa_test_assert(
 not has_function_privilege('anon','public.qa_contribute_public_documentacao(uuid,text,text,text)','EXECUTE'),
 'anonymous users must not execute the contribution RPC'
);
select public.qa_test_assert(
 has_function_privilege('authenticated','public.qa_contribute_public_documentacao(uuid,text,text,text)','EXECUTE'),
 'authenticated users must execute the contribution RPC'
);

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
insert into public.qa_referencias(
 id,user_id,categoria,titulo,conteudo,publica,tipo_documentacao,tarefa_id
) values (
 '66666666-6666-4666-8666-666666666666',
 '11111111-1111-4111-8111-111111111111',
 'nota','Manual inicial','Versão original do procedimento',false,'manual',
 '55555555-5555-4555-8555-555555555555'
);
update public.qa_referencias set publica=true
where id='66666666-6666-4666-8666-666666666666';
reset role;

-- B cannot query the operational table directly; public content remains on the RPC.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.qa_test_assert(
 (select count(*)=0 from public.qa_referencias
  where id='66666666-6666-4666-8666-666666666666'),
 'contributor must not receive direct table access'
);

-- The restricted RPC edits content and returns only the allowlisted public projection.
select public.qa_test_assert(
 (
  select array_agg(key order by key)=array[
   'categoria','conteudo','created_at','id','publica','tipo_documentacao','titulo','updated_at'
  ]
  from jsonb_object_keys(public.qa_contribute_public_documentacao(
   '66666666-6666-4666-8666-666666666666',
   'Manual revisado','Conteúdo revisado pela conta B','manual'
  )) as keys(key)
 ),
 'contribution RPC must return only safe public fields'
);

-- A direct table UPDATE/DELETE by B must remain blocked by the owner-only policies.
update public.qa_referencias
 set titulo='Tentativa direta',publica=false,tarefa_id=null
 where id='66666666-6666-4666-8666-666666666666';
delete from public.qa_referencias
 where id='66666666-6666-4666-8666-666666666666';
select public.qa_test_assert(
 public.qa_public_documentacoes_v1('66666666-6666-4666-8666-666666666666'::uuid)->0->>'titulo'
   ='Manual revisado',
 'direct UPDATE/DELETE must not alter or remove a public document'
);
select public.qa_test_assert(
 (select count(*)=1
  from public.qa_documentacao_versoes
  where documentacao_id='66666666-6666-4666-8666-666666666666'
    and user_id='22222222-2222-4222-8222-222222222222'
    and titulo='Manual inicial'
    and conteudo='Versão original do procedimento'),
 'the previous version and contributing user must be snapshotted'
);

-- B uploads under their own folder. Metadata insertion must be able to see
-- this just-uploaded object, even before its metadata row exists.
insert into storage.objects(bucket_id,name)
values (
 'qa-documentacoes',
 '22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666/77777777-7777-4777-8777-777777777777.txt'
);
insert into public.qa_documentacao_arquivos(
 id,documentacao_id,user_id,nome,mime,tamanho,path
) values (
 '77777777-7777-4777-8777-777777777777',
 '66666666-6666-4666-8666-666666666666',
 '22222222-2222-4222-8222-222222222222',
 'contribuicao.txt','text/plain',32,
 '22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666/77777777-7777-4777-8777-777777777777.txt'
);
select public.qa_test_assert(
 (select count(*)=1 from public.qa_documentacao_arquivos
  where id='77777777-7777-4777-8777-777777777777'),
 'contributor must read attachment metadata on a public document'
);
select public.qa_test_assert(
 (select count(*)=1 from storage.objects
  where name='22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666/77777777-7777-4777-8777-777777777777.txt'),
 'contributor must read their uploaded object'
);
delete from public.qa_documentacao_arquivos
where id='77777777-7777-4777-8777-777777777777';
select public.qa_test_assert(
 (select count(*)=1 from public.qa_documentacao_arquivos
  where id='77777777-7777-4777-8777-777777777777'),
 'contributors must not delete attachment metadata owned by the document author'
);
reset role;

-- Anonymous readers can access the registered public attachment, but not history.
set role anon;
select set_config('request.jwt.claim.sub','',false);
select public.qa_test_assert(
 (select count(*)=1 from public.qa_documentacao_arquivos
  where id='77777777-7777-4777-8777-777777777777'),
 'anonymous reader must see public attachment metadata'
);
select public.qa_test_assert(
 (select count(*)=1 from storage.objects
  where name='22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666/77777777-7777-4777-8777-777777777777.txt'),
 'anonymous reader must download a registered public attachment'
);
reset role;

-- A retains ownership, visibility and TF linkage, can remove B's attachment,
-- and can privatize the document.
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select public.qa_test_assert(
 (select user_id='11111111-1111-4111-8111-111111111111'
      and publica=true
      and tarefa_id='55555555-5555-4555-8555-555555555555'
  from public.qa_referencias
  where id='66666666-6666-4666-8666-666666666666'),
 'contribution must preserve owner, visibility and TF link'
);
delete from public.qa_documentacao_arquivos
where id='77777777-7777-4777-8777-777777777777';
delete from storage.objects
where name='22222222-2222-4222-8222-222222222222/66666666-6666-4666-8666-666666666666/77777777-7777-4777-8777-777777777777.txt';
update public.qa_referencias set publica=false
where id='66666666-6666-4666-8666-666666666666';
reset role;

-- Once private, B cannot read or contribute. The owner can still delete the row.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
select public.qa_test_assert(
 public.qa_public_documentacoes_v1('66666666-6666-4666-8666-666666666666'::uuid)='[]'::jsonb,
 'privatized document must disappear from the public RPC'
);
do $$
begin
  begin
    perform public.qa_contribute_public_documentacao(
      '66666666-6666-4666-8666-666666666666',
      'Tentativa após privatização','Não deve salvar','manual'
    );
    raise exception 'private document contribution unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
delete from public.qa_referencias
where id='66666666-6666-4666-8666-666666666666';
select public.qa_test_assert(
 (select count(*)=0 from public.qa_documentacao_versoes
  where documentacao_id='66666666-6666-4666-8666-666666666666'),
 'version history must cascade when the owner deletes the document'
);
reset role;
