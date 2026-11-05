# QA Hub — Hub de Tarefas

Plataforma web para documentar testes de software: tarefas (TFs), cenários, resultados, explicações, diagramas Mermaid e indicadores. É uma evolução **não destrutiva** do hub estático existente.

## Como abrir

- `index.html`: hub original; a pasta `184728/` continua preservada.
- `qa.html`: novo espaço de QA (acessível também pelo link na página inicial).
- Requer um servidor HTTP (GitHub Pages ou desenvolvimento local), pois `qa.js` usa módulos ES.

Para rodar localmente, por exemplo, use `python -m http.server 8080` e acesse `http://localhost:8080/qa.html`. O aplicativo usa ES modules no navegador e CDNs com versões fixadas; não há build de Node obrigatório neste incremento.

## Configurar Supabase

1. Conceda acesso ao projeto Supabase correto na conexão que você usa para administrar o banco.
2. Revise `supabase/schema.sql` e execute o conteúdo no **SQL Editor do projeto de QA**, uma única vez.
3. Configure **Authentication > Providers > Email**. Se o projeto exigir confirmação de email, confirme a conta antes de entrar.
4. Verifique em **Data API** que o schema `public` está exposto e que as tabelas `qa_*` respondem para o usuário autenticado.
5. A configuração pública do cliente está em `qa-config.js`. A `publishable key` pode estar no frontend; **não** coloque senha PostgreSQL, `service_role` ou secret key nesse arquivo.
6. Abra `qa.html`, crie uma conta e faça login.

O projeto informado pelo usuário precisa estar autorizado para aplicar e validar a migração: a conexão Supabase disponível ao agente **não tinha permissão** para acessar esse projeto no momento da implementação. Portanto, o SQL está versionado, mas **não foi aplicado no banco remoto**.

## Funcionalidades do primeiro incremento

- Login e cadastro de conta via Supabase Auth.
- TFs: código, título, BUILD/RELEASE, versão, módulo, ambiente, base, empresa, testador, data, situação, descrição, explicação, causa, correção, conclusão e observações.
- Cenários: ordenação, passos, esperado/obtido, resultado e observações. Cadastro, edição e exclusão independentes.
- Diagramas: código Mermaid armazenado no banco, prévia sob demanda com `securityLevel: strict`.
- Dashboard com estatísticas, gráfico por situação (Chart.js), divisão BUILD/RELEASE e recentes.
- Busca, filtros de tipo e situação.
- Importação assistida de relatório textual no formato já usado pelo QA. Importações são criadas como **rascunho** e os cenários como **não executados** para impedir aprovação automática sem revisão.
- Responsividade para desktop, tablet e celular.
- SQL com políticas Row Level Security por proprietário, inclusive proteção de registros filhos.

## Segurança

O repositório é público. **Não faça commit de relatórios reais, dados sensíveis de clientes, prints internos ou senhas**. As TFs e os cenários persistem no Supabase sob as políticas de acesso, não no GitHub.

As tabelas foram criadas com RLS e acesso apenas a usuários autenticados, com restrições por `auth.uid()`; `anon` não recebe permissões nessas tabelas. Para compartilhar dados entre testadores, será necessário um modelo explícito de equipe/permissões (fase posterior).

**Importante:** a importação de cenários ocorre após a TF ser criada; caso a segunda etapa falhe, a TF fica cadastrada como rascunho e pode ser complementada manualmente. Não há transação RPC atômica neste MVP.

## Verificação realizada e pendente

Realizado: inspeção do hub anterior; validação sintática do JavaScript; teste isolado do parser com cenário de importação e flags de validação.

Pendente: aplicar SQL no Supabase-alvo; testar login/logout real, RLS para usuários diferentes, CRUD completo, Mermaid, gráfico e layouts em navegadores reais. Estes testes **não** devem ser registrados como aprovados sem execução.

## Limites atuais

Os widgets do dashboard usam os primeiros 1.000 registros de TFs e 3.000 cenários retornados pelo Supabase. Paginação no servidor, anexos no Storage, auditoria detalhada e trabalho colaborativo ficam para as fases seguintes.

Ver o planejamento em `docs/PLANO_EVOLUCAO_QA.md`.
