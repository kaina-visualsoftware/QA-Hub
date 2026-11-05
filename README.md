# QA Hub — Gestão de testes de software

Plataforma web para documentar tarefas de teste (TFs), cenários, resultados, explicações, diagramas Mermaid e indicadores. O QA Hub é a **única interface** publicada neste repositório.

## Como abrir

- `index.html`: redireciona automaticamente para o QA Hub, preservando parâmetros e fragmentos da URL.
- `qa.html`: interface única do sistema; o endereço permanece para compatibilidade com os callbacks de confirmação do Supabase.
- O hub estático anterior e a página legada `184728/page.html` foram retirados da versão atual. Permanecem recuperáveis no histórico Git.
- Requer servidor HTTP (GitHub Pages ou desenvolvimento local), pois `qa.js` usa módulos ES.

Site: `https://kaina-visualsoftware.github.io/Tarefas/` (abre o QA automaticamente). Para executar localmente, use `python -m http.server 8080` e acesse `http://localhost:8080/`. O aplicativo usa módulos ES e CDNs versionadas, sem etapa de build Node obrigatória.

## Configurar Supabase

1. Conceda acesso ao projeto Supabase correto na conexão que você usa para administrar o banco.
2. Revise `supabase/schema.sql` e execute o conteúdo no **SQL Editor do projeto de QA**, uma única vez.
3. Configure **Authentication > Providers > Email**. Se o projeto exigir confirmação de email, confirme a conta antes de entrar.
4. Verifique em **Data API** que o schema `public` está exposto e que as tabelas `qa_*` respondem para o usuário autenticado.
5. A configuração pública do cliente está em `qa-config.js`. A `publishable key` pode estar no frontend; **não** coloque senha PostgreSQL, `service_role` ou secret key nesse arquivo.
6. Abra `qa.html`, crie uma conta e faça login.

As migrações de base e administrador foram aplicadas no projeto Supabase **SIA** pela conexão **SPA**. Ainda precisam de validação real de fluxos de navegação, CRUD e isolamento entre contas. Não execute a migração inicial novamente em um projeto que já possua as políticas.

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

Pendente: testar login/logout real, RLS entre usuários diferentes, CRUD completo, Mermaid, gráficos e layouts em navegadores reais. As migrações estão aplicadas, mas esses testes não foram homologados.

## Limites atuais

Os widgets do dashboard usam os primeiros 1.000 registros de TFs e 3.000 cenários retornados pelo Supabase. Paginação no servidor, anexos no Storage, auditoria detalhada e trabalho colaborativo ficam para as fases seguintes.

Ver o planejamento em `docs/PLANO_EVOLUCAO_QA.md`.

## Administração de testes

A migração `supabase/admin_roles.sql` adiciona o papel de administrador do **QA Hub** (não é administrador do projeto Supabase nem da organização). Usuários comuns continuam vendo apenas suas TFs. Administradores podem consultar, editar e excluir todas as TFs, cenários e diagramas do QA Hub.

- Para autorizar alguém, um responsável pelo banco insere previamente um convite de uso único em `app_private.qa_admin_invites` pelo SQL Editor, sem expor o email em um repositório público.
- O usuário se cadastra por email e senha no QA Hub. A permissão só é concedida quando o email for confirmado pelo Supabase Auth. **Mantenha a confirmação de email obrigatória** no projeto.
- O banco consome o convite e vincula o papel à identificação UUID autenticada. O frontend apenas verifica o papel via `qa_admins`; nunca recebe chaves privilegiadas.
- A tabela pública `qa_admins` tem RLS para leitura do próprio papel. Somente o serviço interno que consome convites pode cadastrar administradores.
- A migração foi aplicada no projeto SIA pela conexão SPA. Um convite inicial foi configurado diretamente no banco, não neste repositório.
- O cadastro Auth precisa ser realizado pelo fluxo regular do site, pois a conexão de administração de banco não possui operação de criação de usuários Auth.

## URL de autenticação e publicação

Em **Supabase Dashboard → Authentication → URL Configuration**, configure a **Site URL** e adicione em **Redirect URLs**: `https://kaina-visualsoftware.github.io/Tarefas/qa.html`. A tela continua nesse endereço para não invalidar confirmações de e-mail existentes. Não use `localhost:3000` como endereço público do sistema.

O QA Hub usa `QA_CONFIG.authRedirectUrl` para cadastro e reenvio de confirmação. O redirecionamento da raiz para `qa.html` preserva o fragmento e os parâmetros, inclusive os de autenticação. Links de confirmação previamente expirados não são renovados automaticamente.

## Preenchimento rápido de TF por texto

Na opção **Nova TF**, cole um relatório ou uma explicação em linguagem natural em **Preenchimento rápido**:

1. **Extrair campos do texto** usa regras de interpretação locais. Funciona em qualquer navegador, sem chave de API ou custo adicional; entende relatórios com seções e também descrições livres, com resultado limitado ao que estiver explícito.
2. **Usar IA gratuita do Chrome** tenta o modelo integrado no dispositivo, quando a versão do Chrome, o equipamento e o idioma forem compatíveis. O recurso pode estar indisponível, exigir download e não oferecer suporte pleno a português. O botão fica indisponível quando o navegador reporta incompatibilidade.
3. Revise a prévia, selecione **Substituir campos já preenchidos** apenas se necessário e clique em **Aplicar no formulário**. Os campos são editáveis. Ao salvar uma nova TF, os cenários extraídos são criados como **não executados**, nunca como aprovados automaticamente.

**Privacidade:** nenhuma das duas extrações envia o texto a um provedor externo de IA. A informação só é enviada ao Supabase na operação normal de salvar a TF. Não há chaves de terceiros no frontend nem custos de tokens no fluxo local. Relatórios de sistemas internos não devem ser enviados para serviços gratuitos de IA externos sem autorização e avaliação de tratamento dos dados.

**Limites:** extração local de até 30.000 caracteres, IA local de até 16.000 caracteres, até 50 cenários extraídos. É necessário conferir códigos, versões, etapas e resultados; a IA pode errar. O recurso não substitui a execução dos testes.

Uma futura integração com API externa (por exemplo, plano gratuito do Gemini) exigirá chave guardada **exclusivamente** em Supabase Edge Function/Secrets, consentimento para compartilhar o texto, limite de consumo e revisão de privacidade. A integração externa **não foi habilitada**.
