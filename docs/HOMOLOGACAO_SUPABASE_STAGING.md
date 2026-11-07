# Homologação real de RLS, Auth e Storage — QA Hub React

**Issue:** #37 · **PR:** #39 (draft) · **Status:** suíte implementada, execução com contas reais pendente.

## Finalidade e limite de segurança

Os testes E2E existentes usam respostas sintéticas do Supabase e **não** comprovam as
políticas de linha do Postgres. Esta suíte faz leituras reais com o cliente público
do Supabase, dois usuários **não administradores** e uma sessão anônima.

O arquivo `frontend/scripts/staging-rls.mjs` não grava, atualiza ou apaga
TFs, casos, documentos, requisitos, diagramas ou objetos no Storage.
Efetuar login cria sessões de autenticação normais. Não utiliza service_role,
SQL remoto, RPC de mutação nem chave secreta. As mensagens do job não exibem
credenciais, emails, IDs de usuários ou conteúdo dos registros.

**Não utilizar em produção.** O validador rejeita explicitamente o ref
do Supabase usado pelo QA Hub publicado e exige o ref previsto de outro
projeto, HTTPS, confirmação textual e chave pública/anon. Caso qualquer
variável esteja ausente, o teste falha antes de consultar a rede.

## Preparar um projeto isolado

1. Criar ou selecionar um **projeto Supabase exclusivamente de homologação**,
   diferente do projeto publicado. Aplicar nele as migrações compatíveis do
   QA Hub de forma controlada; não usar dados de clientes.
2. Criar e confirmar os emails de **duas contas de teste comuns**
   (A e B). Nenhuma deve pertencer à tabela `qa_admins`.
3. Como conta A, criar uma TF **privada** com pelo menos um cenário,
   um diagrama e um arquivo no bucket privado `qa-requisitos`;
   criar também outra TF A **publicada**, com cenário e diagrama sintéticos.
4. Como conta B, criar uma TF **privada** com pelo menos um cenário,
   um diagrama e um arquivo no mesmo bucket, sob a pasta de B.
5. Registrar os IDs das TFs e os caminhos exatos dos dois objetos no
   formato `uuid-da-conta/uuid-da-tf/uuid-do-objeto.txt`
   (ou pdf/docx/md). O arquivo deve estar entre os 100 primeiros itens
   da pasta de cada TF para a verificação por listagem.
6. Manter os dados de teste deliberadamente fictícios.

## GitHub Actions — somente execução manual

Workflow: `.github/workflows/qa-staging-rls.yml`.
Configure um Environment chamado `qa-staging` no GitHub, preferencialmente
com aprovação humana obrigatória e acesso limitado. Coloque os
seguintes **Environment secrets** (nunca em código ou em comentários):

| Secret | Conteúdo |
|---|---|
| `QA_STAGING_URL` | URL HTTPS do projeto separado de homologação |
| `QA_STAGING_PUBLISHABLE_KEY` | Chave pública do projeto (não `service_role` / `sb_secret`) |
| `QA_STAGING_EMAIL_A`, `QA_STAGING_PASSWORD_A` | Conta comum A |
| `QA_STAGING_EMAIL_B`, `QA_STAGING_PASSWORD_B` | Conta comum B |

Coloque as seguintes **Environment variables** (não credenciais):

| Variable | Conteúdo |
|---|---|
| `QA_STAGING_EXPECTED_REF` | Ref exato do projeto separado |
| `QA_STAGING_PRIVATE_TASK_A` | ID da TF privada da conta A |
| `QA_STAGING_PRIVATE_TASK_B` | ID da TF privada da conta B |
| `QA_STAGING_PUBLIC_TASK_A` | ID da TF publicada pela conta A |
| `QA_STAGING_PRIVATE_ATTACHMENT_A` | Caminho do anexo privado de A |
| `QA_STAGING_PRIVATE_ATTACHMENT_B` | Caminho do anexo privado de B |

A execução exige a entrada literal `READ_ONLY_STAGING`. Não roda em
push nem em pull_request. Enquanto o workflow existir apenas na
branch da PR, ele pode não aparecer no disparo manual do GitHub
(o GitHub normalmente registra workflow_dispatch pelo arquivo da
branch padrão). Para validar **antes de integrar**, use o script
na cópia da branch, com as mesmas variáveis definidas em um
ambiente seguro, sem colocá-las no histórico do terminal:

```sh
cd frontend
npm ci --no-audit --no-fund
node --test tests/staging-rls-guards.node.mjs
node scripts/staging-rls.mjs
```

O comando manual também exige `QA_STAGING_CONFIRM=READ_ONLY_STAGING`
e todas as configurações anteriores. Sem isso ele não executa consultas.

## Matriz de validação e critérios

| Verificação | Esperado |
|---|---|
| Conta A / conta B | Autenticam com `getUser()`, identidade distinta, sem papel admin |
| TF privada A / B | Cada proprietário lê a própria; outra conta e anon não leem |
| Cenários e diagramas privados | Proprietário encontra ao menos 1; outra conta e anon não leem |
| TF publicada de A | A, B e anon acessam a projeção permitida via `qa_public_tasks_v1` e `qa_public_task_v1`; a resposta contém cenário e diagrama |
| Consulta direta às tabelas de TF/cenário/diagrama | Anon e outra conta são barrados, **inclusive** em linhas publicadas |
| Documentos, requisitos e fontes | Outra conta e anon não leem dados das TFs privadas e da publicada |
| Storage privado | O proprietário lista o anexo real; outra conta e anon não listam o mesmo arquivo |
| Colunas internas de publicação | Outra conta e anon **não** conseguem ler `user_id`, `empresa`, `base_teste`, `testador` da TF publicada pelo Data API |
| IDs internos de cenários e diagramas | Outra conta e anon **não** conseguem ler `user_id` dos registros publicados via Data API |

Negativas aceitam resultado vazio ou rejeição RLS/grant 401/403/42501.
Outros erros, ausência das fixtures ou acesso inesperado fazem a execução
**falhar**. A suíte não publica ou despublica TFs e não testa permissões
de escrita: esse bloco exige um plano separado de fixtures descartáveis.

## Bloqueador de segurança identificado na revisão de SQL

Em `supabase/qa_public_visibility.sql`, a combinação de `GRANT SELECT`
na tabela inteira com política `FOR SELECT USING (publica=true)`
indica que qualquer cliente pode solicitar **colunas não exibidas**
pela interface pública. O `SELECT` explícito do React não bloqueia
consultas externas ao Data API. As políticas dos cenários e diagramas
publicados também operam por **linha**, sem ocultar `user_id`.

Isso representa um **risco de exposição de metadados** caso o SQL
esteja implantado como registrado. Ainda não foi comprovado em banco
real; a suíte inclui casos negativos que deverão reprovar se houver
acesso indevido. **Bloquear o rollout até revisar e homologar.**

A correção precisa ocorrer na API/RLS: considerar uma camada pública
separada com colunas mínimas (por exemplo, snapshot publicado ou RPC
de saída tipada e autorizada), retirar o acesso público amplo das
tabelas operacionais e adaptar o leitor React **e o leitor legado**
num rollout coordenado. Não basta alterar a projeção de frontend.
Não aplicar migrações diretamente no projeto publicado.

## Critérios para aceitar a homologação

- Saída do script com todos os checks PASS, sem bypass de casos negativos.
- Conta A/B e fixtures conferidas; nenhum fixture pertence a admin.
- Evidências de duas contas e visitante anônimo em ambiente diferente
  do projeto publicado; evidência sem dados pessoais ou credenciais.
- Revisão do possível vazamento de metadados e correção homologada.
- Homologação manual complementar: recuperação de senha, allowlist do
  callback `auth.html`, publicação/despublicação e ações de escrita
  sob RLS com fixtures descartáveis e plano de limpeza/rollback.
- Só depois considerar retirar a PR do estado draft.

## Correção preparada: projeção pública com RPC e bloqueio direto

**Fase A — primeiro no staging:** executar `supabase/qa_public_read_api.sql`
com conta administrativa autorizada, verificar a assinatura das funções e o
dono da função, e testar ambas com sessão anônima. As funções públicas
`qa_public_tasks_v1()` e `qa_public_task_v1(uuid)` são intencionalmente
`SECURITY DEFINER`, com `search_path` vazio, lista fixa de colunas,
limite de registros e predicado obrigatório `publica=true`. Seus resultados
não incluem proprietário, empresa, base de teste, testador nem identificador
interno de vínculo. A permissão de execução é concedida exclusivamente
a `anon` e `authenticated`, depois de revogar de `PUBLIC`.

**Fase B — após atualizar os leitores:** as páginas `public.js` (legado)
e `frontend/src/features/public/public-data.ts` (React) usam as RPCs, não
a seleção direta das tabelas. Confirmar em navegação privada, com e sem login,
que a listagem, o detalhe publicado, os cenários e diagramas funcionam.

**Fase C — lockdown no staging:** executar
`supabase/qa_public_read_lockdown.sql`. Ele remove as três políticas
`*_public_read` do modelo antigo e revoga `SELECT` em três tabelas de
`anon`, preservando as operações autenticadas existentes. Inspecionar
também quaisquer outras políticas permissivas, grants indiretos,
roles herdadas e privilégios de funções antes de considerar essa etapa
segura. Verificar com A, B e anon que leitura direta de linha publicada
fica indisponível, sem impedir a leitura via RPC. Só os proprietários
devem continuar a ler seus dados privados.

**Fase D — rollout coordenado:** não executar C isoladamente em produção,
pois isso quebraria o leitor legado publicado até ele ser atualizado.
Planejar janela de publicação com backup, confirmação dos leitores
compatíveis, aplicação de SQL, repetição dos testes negativos e plano de
retorno compatível (código + políticas), sem restaurar grants amplos
como medida improvisada. Não executar SQL de homologação no projeto público.

A implementação da branch **não executou** os scripts no banco.
O teste com Supabase real e usuários de homologação segue obrigatório.
