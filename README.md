# QA Hub — Gestão de testes de software

Plataforma web para documentar tarefas de teste (TFs), cenários, resultados, explicações, diagramas Mermaid e indicadores. O QA Hub é a **única interface** publicada neste repositório.

## Como abrir

- `index.html`: redireciona automaticamente para o QA Hub, preservando parâmetros e fragmentos da URL.
- `qa.html`: interface única do sistema; o endereço permanece para compatibilidade com os callbacks de confirmação do Supabase.
- O hub estático anterior e a página legada `184728/page.html` foram retirados da versão atual. Permanecem recuperáveis no histórico Git.
- Requer servidor HTTP (GitHub Pages ou desenvolvimento local), pois `qa.js` usa módulos ES.

Site: `https://kaina-visualsoftware.github.io/QA-Hub/` (abre o QA automaticamente). Para executar localmente, use `python -m http.server 8080` e acesse `http://localhost:8080/`. O aplicativo usa módulos ES e CDNs versionadas, sem etapa de build Node obrigatória.

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

Em **Supabase Dashboard → Authentication → URL Configuration**, configure a **Site URL** e adicione em **Redirect URLs**: `https://kaina-visualsoftware.github.io/QA-Hub/qa.html`. Após a renomeação do repositório, confirme a nova URL de produção no Supabase Auth. Os links de confirmação novos devem usar o endereço QA-Hub; mantenha o endereço antigo na lista de redirecionamentos apenas pelo período necessário para confirmações já enviadas. Não use `localhost:3000` como endereço público do sistema.

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

- **Gerar com IA NVIDIA:** ao clicar no botão, o navegador chama a função autenticada `qa-ai` do Supabase, que usa a chave de forma privada. O sistema tenta primeiro `nvidia/nemotron-3.5-lightning-30b-a3b` e depois `z-ai/glm-5-3-flash`, ambos identificados no catálogo NVIDIA Build como **Free Endpoint** em 05/11/2026. Tenta identificar os modelos disponíveis usando `GET /v1/models` e só tenta modelos dessa lista previamente permitida. Uma resposta válida avança para a Etapa 2.
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

**Privacidade:** clicar em **Gerar com IA NVIDIA** inicia diretamente o envio do conteúdo à NVIDIA, sem caixa de autorização adicional. Essa transferência é informada na interface; remova informações sensíveis e dados de clientes antes de usar a IA online. A extração sem IA e a IA local não enviam relatórios à NVIDIA. A NVIDIA pode impor cotas de uso/alterar modelos gratuitos; um endpoint denominado gratuito **não** significa gratuidade ilimitada. A lista estática de candidatos precisa ser revisada quando o catálogo mudar.

**Observabilidade:** os erros do provedor são traduzidos para mensagens sem expor credenciais. A resposta estruturada é normalizada no cliente e limitada às colunas esperadas da TF.

### Respostas flexíveis da NVIDIA

O backend usa `supabase/functions/qa-ai/response.mjs` para reconhecer JSON, blocos Markdown, campos aninhados, pequenas falhas de sintaxe e respostas rotuladas em linguagem natural. Para Nemotron 3.5, a função solicita saída sem raciocínio estendido, evitando consumir o limite de resposta antes de gerar os campos. Se a resposta ainda estiver incompleta, o QA Hub utiliza automaticamente a extração local do texto original, informando isso ao usuário. Não são inventados campos, resultados ou aprovações.

A interface da etapa 1 mantém somente instruções curtas. O clique em **Gerar com IA NVIDIA** inicia diretamente o processamento e informa discretamente que o relatório é enviado ao serviço. Respostas do provedor são tratadas como dados, jamais como comandos.


## Renomeação do repositório (QA-Hub)

O repositório oficial agora é [`kaina-visualsoftware/QA-Hub`](https://github.com/kaina-visualsoftware/QA-Hub). O site usa o novo caminho `https://kaina-visualsoftware.github.io/QA-Hub/`.

**Configuração necessária no Supabase Dashboard** (o app não pode configurar isso automaticamente): em **Authentication → URL Configuration**, ajuste **Site URL** para `https://kaina-visualsoftware.github.io/QA-Hub/` e inclua **Redirect URLs** `https://kaina-visualsoftware.github.io/QA-Hub/qa.html`. Confira se os templates de e-mail usam `{{ .RedirectTo }}` ou o novo site. Após validar o login e a confirmação, remova a URL antiga da lista quando não for mais necessária.

Para quem possui clone local, atualize o remote: `git remote set-url origin https://github.com/kaina-visualsoftware/QA-Hub.git`.

## Ferramentas integradas (navegação única)

Os módulos de post, roteiro de testes, lista de release, informações importantes, comparação de textos e comparação XML são acessados **dentro do QA Hub** por rotas `qa.html#/ferramentas/{modo}`. Não abrem outra guia nem exibem outro menu/cabeçalho. O mesmo login Supabase e a sessão do navegador são usados nos módulos.

Para preservar o isolamento do CSS e do JavaScript legado dos geradores, a área central usa um iframe interno **da mesma origem**, em modo `geradores.html?embedded=1&mode={modo}`, com atualização de altura e troca de ferramenta por mensagens validadas pela origem. O iframe é uma implementação interna da área de ferramentas, não uma segunda navegação. Os links externos antigos `geradores.html#post` e equivalentes redirecionam para as rotas do QA Hub.

O fluxo de TF mantém contexto: o seletor **TF em foco** permite escolher uma tarefa, e os geradores de post/roteiro importam seus dados automaticamente quando a rota inclui `?tf=<uuid>`. Os casos gerados são revisados antes de anexar à própria TF por meio da RPC `qa_attach_generated_cases`; novos cenários são registrados como **não executados**. Ao trocar de TF, o contexto é recarregado. O logout desmonta o módulo e limpa o contexto da sessão.

Verificar em homologação: login, links diretos antigos, navegação do menu no desktop/mobile, entrada contextual pela TF, edição sem perda ao alternar módulos, histórico e cópia/exportação, redimensionamento com resultados longos, e limpeza de sessão no logout.

## Fase 2 — execução, posts, relatórios e histórico documental

A Fase 2 acrescenta as abas **Execução**, **Documentos** e **Histórico** à TF. Os registros permanecem vinculados à mesma `tarefa_id`:

1. **Execução:** abre a TF e registra o status real de cada cenário (`nao_executado`, `aprovado`, `reprovado` ou `bloqueado`), resultado obtido e observações. Aprovação/reprovação exigem descrever o que aconteceu; bloqueios exigem justificativa. O status geral da TF não é alterado automaticamente.
2. **Relatório:** na aba Documentos, **Gerar relatório da execução** monta uma prévia com base nos cenários persistidos. Revise e clique **Salvar versão**; copie ou exporte em Markdown quando necessário. A geração não equivale a execução de testes.
3. **Post vinculado:** abra **Posts do fórum** a partir da TF, gere ou recupere um post, edite o texto e use **Salvar versão na TF**. A aba Documentos permite abrir a versão e criar outra sem sobrescrever a anterior.
4. **Histórico:** lista revisões de posts e relatórios com título, tipo, versão e data. Este histórico é documental, não uma auditoria completa de edição das TFs.
5. **Diagramas:** no gerador de diagramas da TF, escolha quais cenários devem compor o contexto. O Supabase guarda a origem (`tf`, `texto` ou `manual`) e os IDs dos cenários selecionados.
6. **Roteiro vinculado:** o antigo editor de execução baseado em Markdown continua disponível apenas para roteiros locais sem TF. Quando a TF está vinculada, o botão **Abrir execução dos cenários da TF** leva ao registro persistido.

### Banco e permissões

A migration versionada `supabase/qa_phase2_documents.sql` cria `qa_documentos` com RLS, versões imutáveis de `post` e `relatorio`, e a função `qa_save_document` usando `SECURITY INVOKER`. A função serializa novas versões por TF, evita salvar a mesma revisão sem alterações e respeita o acesso ao registro pai. Documentos **continuam privados mesmo quando uma TF é pública** na galeria. A migração acrescenta também metadados opcionais à tabela existente `qa_diagramas`. Nenhuma tabela legada é removida ou reescrita.

Antes de publicar uma instalação nova, aplique **na ordem** `supabase/schema.sql`, as demais migrations anteriores e `supabase/qa_phase2_documents.sql` no projeto Supabase correspondente. No ambiente principal do QA Hub, a migration da Fase 2 foi aplicada em 06/11/2026.

**Validação recomendada:** abra uma TF existente, execute um cenário e confira que o status da TF não mudou; gere um relatório, salve duas revisões, recarregue e abra o histórico; gere um post, vincule-o à TF; gere diagrama selecionando cenários distintos; repita as verificações com um segundo usuário e confirme que ele não acessa os documentos privados.

## Fase 3 — Releases, comparações e conhecimento reutilizável

A TF continua sendo a entidade principal. A aba **Vínculos** reúne três recursos integrados:

- **Releases:** informe o número da versão (formato `12.10.06.0000`) e confirme manualmente a associação da TF. A ferramenta **Lista e comunicado** também permite vincular à release depois de organizar a lista, **somente quando o código da TF em foco está presente** nos números informados. O vínculo nunca é inferido automaticamente por título ou versão. A operação é idempotente.
- **Comparações de textos/XML:** ao comparar, é possível escolher **Salvar indicadores na TF**. Apenas as quantidades de adições, remoções e alterações são persistidas em `qa_artefatos`. O XML e os textos originais não são armazenados nem enviados ao Supabase nesse fluxo. A aba Vínculos mostra o histórico resumido.
- **Referências técnicas:** cadastre checklists, regras e notas **privadas para sua conta**, reutilize entre TFs, copie ou acrescente ao rascunho de um documento. É necessário confirmar que não há credenciais ou dados pessoais. O gerador legado **Informações importantes** continua separado, local, sem migração automática de senhas/códigos/acessos.

O **dashboard** apresenta cobertura de execução = cenários com status aprovado/reprovado/bloqueado ÷ total de cenários cadastrados, além de quantidade de TFs com/sem cenários. Cobertura não significa aprovação da TF nem mede todos os requisitos do software. Os cálculos respeitam o conjunto de TFs/cenários carregado para a conta e os limites de paginação já existentes.

### Implantação e segurança

A migração aditiva `supabase/qa_phase3_links.sql` cria `qa_releases`, `qa_release_tarefas`, `qa_artefatos` e `qa_referencias`, habilita RLS em todas, restringe o acesso à conta proprietária e cria a RPC `qa_link_release` como `SECURITY INVOKER`. Não há remoção de registros nem associação automática de TFs legadas.

O campo `codigo` da TF deve corresponder exatamente à lista autorizada ao associar pela ferramenta de release. Vincular uma tarefa de outro usuário é bloqueado; administradores podem visualizá-la quando autorizados, mas a criação de vínculo permanece restrita ao proprietário. Não coloque senhas, tokens, dados pessoais ou conteúdo bruto de XML em referências ou relatórios de comparação.

**Homologação:** com TF própria, confirme um vínculo de release e repita para verificar idempotência; gere um diff e um XML, salve os indicadores e confirme ausência dos conteúdos originais; cadastre referência e reutilize em outra TF; confira a cobertura do dashboard antes/depois de registrar a execução de um cenário; teste acesso com contas distintas.
