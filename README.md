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

## Preenchimento rápido de TF com IA sem token

Ao criar uma **Nova TF**, cole um relatório ou uma explicação na seção de preenchimento rápido. Há duas opções:

- **Extrair campos do texto:** extração por regras 100% local, sem baixar modelos, compatível com navegadores modernos. Útil para relatórios com seções e textos livres.
- **Usar IA gratuita · sem token:** executa um modelo aberto **Qwen2.5-0.5B-Instruct** pelo [Transformers.js](https://huggingface.co/docs/transformers.js/v3.8.1/en/installation) em um Web Worker. Usa WebGPU quando possível; caso contrário, tenta WebAssembly/CPU. Não requer login, token, chave de API ou conta de IA. Não envia o relatório a um endpoint de inferência externa.

**Limitações reais:** nenhum LLM local roda garantidamente em todo celular ou computador. A primeira utilização exige conexão para baixar a biblioteca e arquivos públicos do modelo (na ordem de centenas de MB, aproximadamente 500 MB conforme a variante) e memória suficiente. Equipamentos modestos podem ter lentidão ou falhar. Após baixar, os arquivos podem permanecer no cache do navegador, sujeito a limpeza e espaço disponível. A extração por regras fica sempre acessível como alternativa e não depende do modelo.

1. Cole o texto (extração sem IA aceita até **30.000 caracteres**; IA local até **6.000**).
2. Escolha uma opção de extração. No modo IA, a primeira execução pode baixar um modelo volumoso; a interface mostra o progresso.
3. Revise a prévia antes de aplicar. Campos existentes só serão sobrescritos se o usuário marcar essa opção.
4. Clique em **Aplicar no formulário** e depois em **Salvar TF**. Cenários extraídos são gravados como **não executados**, nunca aprovados automaticamente.

**Privacidade:** o JavaScript e os arquivos públicos da IA são baixados de CDNs/Hugging Face; o texto de QA é processado localmente, no navegador, sem requisição de inferência a provedores externos. O conteúdo é transmitido ao Supabase **somente** no fluxo de salvar a TF. Não há segredo ou token de provedor no frontend. Evite incluir dados pessoais ou segredos em relatórios desnecessariamente.

**Validação:** testes automatizados usam modelo simulado, verificação do protocolo do Worker e da normalização JSON. O download e a inferência efetiva do modelo volumoso **não** são exercitados na CI; a compatibilidade e a qualidade do texto gerado precisam de homologação em aparelhos reais. Dados de teste gerados por IA sempre precisam de conferência humana.

## Criação de TF em duas etapas (IA + revisão)

A página **Nova TF** abre na **Etapa 1 — Entrada de texto**. O formulário completo fica oculto até ocorrer uma destas ações:

- **Gerar com IA NVIDIA:** após marcar a autorização de envio do relatório, o navegador chama a função autenticada `qa-ai` do Supabase, que usa a chave de forma privada. O sistema tenta primeiro `nvidia/nemotron-3.5-lightning-30b-a3b` e depois `z-ai/glm-5-3-flash`, ambos identificados no catálogo NVIDIA Build como **Free Endpoint** em 05/11/2026. Tenta identificar os modelos disponíveis usando `GET /v1/models` e só tenta modelos dessa lista previamente permitida. Uma resposta válida avança para a Etapa 2.
- **Extrair sem IA:** interpreta o relatório por regras locais, sem enviar o texto à NVIDIA, e avança para a Etapa 2.
- **Usar IA no dispositivo:** utiliza o modelo aberto local Qwen via Web Worker; requer download e hardware compatível e avança após concluir. Não usa chave da NVIDIA.
- **Seguir manualmente:** abre imediatamente a Etapa 2 com formulário vazio, sem chamada de IA.

A **Etapa 2 — Revisão** permite editar todos os campos, retornar ao texto, visualizar cenários e só grava no Supabase quando se escolhe **Salvar TF**. Cenários extraídos iniciam como `nao_executado`; a IA não declara um teste aprovado automaticamente. O processamento mostra spinner, estado de carregamento, mensagens amigáveis e toasts, incluindo erros de rede/cota.

### Ativar NVIDIA Build com segurança

1. A chave da NVIDIA foi compartilhada anteriormente em uma conversa: **revogue-a no painel da NVIDIA e gere outra**.
2. No projeto Supabase **SIA** (`pqadmlhcsimlcclpkyov`), abra [Edge Functions > Secrets](https://supabase.com/dashboard/project/pqadmlhcsimlcclpkyov/functions/secrets).
3. Cadastre o segredo **`NVIDIA_API_KEY`** com a nova chave da NVIDIA. **Nunca** inclua a chave em `qa.js`, HTML, `qa-config.js`, GitHub ou campos públicos do banco. O segredo deve ser configurado no ambiente da Edge Function.
4. A função `qa-ai` e o controle de cota precisam estar implantados no mesmo projeto. A função exige JWT de usuário válido, permite apenas origem do QA Hub, limita relatórios a 20.000 caracteres, aplica 12 requisições por usuário por dia e intervalo mínimo de 15 segundos, e nunca envia a chave ao navegador.
5. Para verificar, entre no QA Hub, crie uma nova TF, marque o consentimento de enviar a descrição à NVIDIA e clique em **Gerar com IA NVIDIA**. Confira a prévia preenchida. Se a chave estiver ausente, a interface informa isso e oferece extração sem IA.

**Privacidade:** somente a ação explícita de IA NVIDIA envia o conteúdo à NVIDIA; textos podem conter informações de clientes e dados internos, então remova informações sensíveis antes de compartilhar. A extração sem IA e a IA local não enviam relatórios à NVIDIA. A NVIDIA pode impor cotas de uso/alterar modelos gratuitos; um endpoint denominado gratuito **não** significa gratuidade ilimitada. A lista estática de candidatos precisa ser revisada quando o catálogo mudar.

**Observabilidade:** os erros do provedor são traduzidos para mensagens sem expor credenciais. A resposta estruturada é normalizada no cliente e limitada às colunas esperadas da TF.
