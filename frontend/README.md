# QA Hub React — issue #37 (incremento inicial)

A pasta frontend/ contém a nova SPA e NÃO substitui o site público durante a
migração. O legado qa.html permanece ativo como fallback até a homologação.

## Desenvolvimento

Requer Node 22.12+. Execute na pasta frontend/: npm install, npm run dev,
npm run typecheck, npm run lint, npm test e npm run build.
A base Vite do build é /QA-Hub/. Valores públicos do Supabase reutilizam qa-config.js.
Variáveis VITE_ opcionais são descritas em .env.example; nunca incluir service_role,
sb_secret_ ou tokens de provedores no cliente.

O incremento traz Auth, listagem/busca de TFs, criação rápida, edição básica,
cenários, execução manual, edição/exclusão de registros e diagramas Mermaid nativos (lazy). Estados remotos usam TanStack Query; foco local,
Zustand; validação, Zod/React Hook Form. Nenhuma aprovação automática via IA.

Pendências: homologação de inferência do modelo local em dispositivos reais,
geração de diagramas por IA, administração avançada e callbacks de produção,
testes RLS com contas reais,
acessibilidade e desempenho. O lockfile versionado permite reproduzir a instalação com `npm ci`.

## Testes do primeiro incremento

O workflow React instala dependências, executa verificação TS estrita, ESLint,
Vitest e build. O smoke do navegador mede renderização de login, mudança de
modo e ausência de rolagem horizontal em 390/768/1366 px, sem acessar contas reais.
As suites de browser e de dados reais são verificações distintas.

Importações locais reutilizam qa-parser.mjs, exigem revisão de cenários
explícitos e não registram aprovação automática. Erro de anexação mostra alerta
após abrir a TF salva; não há transação atômica neste estágio.

## Geradores nativos e documentos

Ao abrir uma TF, use **Gerar casos com IA**, **Gerar post com IA** e
**Documentos / relatório**. A IA só processa dados após consentimento explícito;
o texto efetivamente enviado pode ser revisado antes do envio.
O backend usa a Edge Function `qa-generators` já publicada, sem chaves privadas
no navegador. Os requisitos aprovados e o contexto completo são consultados
para a TF proprietária; uma TF de outro usuário não pode ter conteúdo enviado
à IA mesmo quando visível a um administrador.
Os casos anexados nunca são marcados como executados.
Os documentos são versionados e permanecem privados por RLS.

O Vite dev usa a porta **8765** por compatibilidade com a lista de origens
permitidas pela Edge Function atual. O callback Auth precisa estar autorizado
se você testar cadastro/recuperação localmente.

## Requisitos, cobertura e fontes privadas

Na TF, abra **Requisitos e cobertura**. As abas permitem importar
especificações, revisar/aprovar/arquivar, relacionar cenários, exportar
cobertura CSV, anexar documentos privados e consultar snapshots das
gerações de IA. Apenas o proprietário tem acesso aos registros privados.

PDF e DOCX têm extração local com PDF.js e JSZip carregados sob demanda; TXT
e MD também são lidos localmente. Documentos digitalizados sem texto extraível
necessitam transcrição manual (não há OCR). A prévia tem limite de 30 mil
caracteres, com original completo preservado após confirmação do upload.
Nenhum arquivo é transmitido à IA por padrão.

## Evidências e auditoria no React

A TF agora possui **Evidências e auditoria**. Observações e URLs HTTPS podem ser
registradas e vinculadas a cenários por uma operação explícita; não é permitido
editar nem apagar evidências já cadastradas. A aba Auditoria mostra eventos
gerados pelos gatilhos do banco em modo somente leitura. Nenhuma senha, log
bruto ou captura binária é enviado ou armazenado nesse módulo.

## Releases e referências técnicas

A TF agora oferece **Releases e referências** em React, com associação explícita de
versões no formato `12.10.06.0000`, referências privadas da conta (checklists,
regras e notas, com validação contra credenciais) e histórico somente leitura dos
contadores de comparação. Para preservar a privacidade, os textos e XML originais
não são guardados nesses registros. A comparação visual e local está
disponível na aba Comparações.

## Comparador local de textos/XML e organizador de release

Na TF, abra **Releases e referências → Comparações** para comparar texto linha a linha
ou XML por hierarquia, namespaces, atributos e valores. A visualização é local,
com paginação e limite de 150 mil caracteres. DTD, entidades e referências de
stylesheet em XML são recusadas. Somente após confirmação explícita são gravados
os contadores `adicionados`, `removidos` e `alterados` na tabela `qa_artefatos`;
o texto/XML original nunca é enviado à base por este recurso.

Na aba **Releases**, o organizador local classifica a lista por status 11/12,
verifica comunicados autorizados e fornece versões copiáveis em texto e BBCode.
Nenhuma liberação ou vínculo de TF é inferido automaticamente da lista;
continua necessária a associação explícita pelo proprietário.

A extração local de PDF/DOCX foi exercitada no smoke Chromium com arquivos
sintéticos. A proteção de RLS, upload e download de originais com contas reais
ainda requer homologação antes do corte de produção.

## Áreas públicas e administrativas (migração em rascunho)

A biblioteca de TFs públicas está acessível pela rota da SPA `#/publicas`,
inclusive **sem autenticação**. O detalhe `#/publicas?tf=<UUID>` carrega
somente uma TF marcada `publica=true`. A consulta pública agora utiliza
`qa_public_tasks_v1` e `qa_public_task_v1`, com projeção de colunas
restrita no SQL, em vez de depender de `SELECT` protegido apenas pelo
frontend. Os scripts correspondentes devem ser aplicados e validados primeiro
no projeto de staging; não existe publicação automática de políticas.
O desenho Mermaid é executado sob demanda com prévia isolada em iframe
sandbox, sem HTML de entrada inserido no documento da aplicação.

O autor pode publicar ou retirar uma TF pela própria página, depois de
confirmar o alcance de exposição: descrição, análise técnica, cenários,
resultados observados e diagramas passam a ser públicos. A mutação é
limitada por `id` e `user_id` e só confirma sucesso após retorno do banco.
O painel `#/admin` verifica `qa_admins` via RLS e somente carrega
a lista administrativa após autorização da conta; filtros por autor,
situação e busca são locais. A tela não gerencia convites nem modifica
políticas administrativas.

A publicação é opt-in e não existe no serviço publicado até o corte
da migração. Testes de autorização no navegador usam Supabase simulado:
não são equivalentes a um teste real de políticas RLS com duas contas.

## Callback React de autenticação (preparado, NÃO ativado)

A segunda entrada Vite auth.html recebe callbacks de Supabase em página
separada. O fragmento de acesso do Supabase não compete com o hash router
TanStack (#/). Após detectar uma sessão, redireciona para a SPA sem
parâmetros temporários de autenticação na URL. O fluxo de recuperação
segue para #/recuperar e oferece atualização de senha autenticada.

O padrão VITE_AUTH_REDIRECT_URL permanece apontando para qa.html.
Para adotar a nova entrada será necessário: deploy da SPA, permitir a URL
https://kaina-visualsoftware.github.io/QA-Hub/auth.html na allowlist de
redirects Supabase, configurar VITE_AUTH_REDIRECT_URL para essa URL,
homologar email de confirmação, recuperação, PKCE/implicit e troca de conta.
Links antigos continuam no legado até o corte aprovado.

Os testes Chromium usam tokens e endpoints simulados, não configurações
reais de autenticação. O cache TanStack é zerado em troca/saída de conta.

## IA generativa local — opcional e sem gravação automática

Na tela Nova TF, use Analisar com IA local somente após marcar a autorização
explícita para download do modelo público. A aplicação importa
@huggingface/transformers@3.8.1 sob demanda num Web Worker separado e
utiliza o modelo onnx-community/Qwen2.5-0.5B-Instruct, herdado do legado.
Prioriza WebGPU e tenta CPU/WASM caso a GPU não funcione. O modelo e o
runtime podem exigir downloads grandes e bastante memória. Não habilitar
automaticamente em dispositivos restritos. O código da biblioteca é
empacotado com Vite; pesos públicos podem ser baixados do repositório do
modelo e componentes WASM do runtime. Nenhum texto da TF é enviado pelo
QA Hub a um backend para esta análise; inferência roda no dispositivo.

Entrada limitada a 6.000 caracteres; a extração determinística continua
aceitando 30.000. A identificação determinística de código e versão tem
precedência sobre o modelo. Saídas são normalizadas, exibidas para revisão,
nunca marcam casos como executados/aprovados, e cenários só são anexados
se o QA os selecionar e salvar a TF. O botão Cancelar encerra o Worker.
Em falhas de compatibilidade/memória/rede use Analisar texto localmente.

Testes Vitest verificam o contrato, worker sintético, limites e cancelamento.
O E2E Chromium usa Worker simulado, sem baixar pesos reais. Homologação
obrigatória ainda pendente: inferência com modelo real em máquina e celular,
medição de memória/rede/tempo, revisão das saídas e acessibilidade.

## Auditoria automatizada de acessibilidade

O workflow `QA Hub React browser smoke` executa
`frontend/tests/browser-accessibility.mjs` com `axe-core@4.14.0`
fixado no lockfile. O teste verifica critérios WCAG 2.0/2.1/2.2
A/AA, overflow horizontal e fluxo de teclado em 390 e 1366 px,
cobrindo login, cadastro, recuperação, biblioteca pública,
detalhe público, workspace autenticado e cadastro rápido de TF.
A suíte falha caso encontre violações automáticas; não há exceções
para contraste. O teste também observa requisições e garante que
pesos, runtime WASM e Worker de IA **não são solicitados antes da
autorização explícita**.

A primeira auditoria apontou 14 conjuntos de falhas de contraste.
Foram corrigidos os tokens de ação primária do HeroUI, textos de
metadados, rótulos, cabeçalho e link público. No commit `c382d8d7`,
as 14 combinações passaram sem violações automáticas nos critérios
verificados. Este resultado **não equivale à homologação completa
WCAG**, que ainda exige testes manuais com leitor de tela, teclado,
zoom até 400%, alto contraste, navegadores e aparelhos reais.

## Controle de foco, reflow e orçamento do carregamento

As caixas de diálogo para registrar falha/bloqueio e ampliar diagramas
compartilham o hook `useModalFocus`: direciona o foco inicial, prende
Tab/Shift+Tab dentro do diálogo, permite Escape e devolve o foco
ao botão de origem. Diagrama Mermaid ampliado também expõe o
texto-fonte em um `details` acessível, além da visualização sandbox.

O E2E de teclado roda junto da auditoria axe-core. Ele exercita
a abertura e o fechamento de ambos os diálogos e confirma que
nenhum resultado de QA é gravado apenas por cancelar a caixa.
A suíte de reflow também verifica 320px CSS (~400% de zoom
sobre um viewport de 1280px), além de 390 e 1366px. O checklist
de homologação humana está em `docs/HOMOLOGACAO_ASSISTIVA_REACT.md`.

O build Vite gera `dist/.vite/manifest.json`. O script
`frontend/scripts/check-bundle-budget.mjs` calcula o gzip
dos assets da primeira navegação (HTML, JS/CSS e imports estáticos)
e falha acima de **350 KiB** ou se módulos pesados de IA, PDF
e Mermaid forem incluídos no caminho inicial. O baseline
medido em CI foi **286.560 bytes gzip**; isto não representa
tempo real de carregamento, Core Web Vitals nem tamanho dos
pesos do modelo baixados sob demanda.

A rodada Chromium aprovada no commit `1ec95c1a`
([evidência](https://github.com/kaina-visualsoftware/QA-Hub/actions/runs/42314979152))
cobriu **21 combinações de tela e largura CSS** (320, 390 e 1366px),
incluindo os dois diálogos: sem violações automáticas nas regras
WCAG testadas e com restituição do foco após Escape. O contraste
do estado vazio do workspace também foi corrigido. O orçamento
e os testes estáticos seguiram verdes. Ainda há homologação
assistiva manual pendente conforme o checklist.


## Fluxo rápido do QA na TF (issue #37)

A tela de TF prioriza agora **Adicionar cenário**, **Testar pendentes**
e **Gerar casos com IA** no topo. Ferramentas menos frequentes ficam em
**Outras ferramentas**; nenhuma funcionalidade de requisitos, evidências,
releases, documentos e diagramas foi removida.

Ao abrir um formulário de cenário, o foco vai para o campo Título;
ao escolher **Testar pendentes**, vai para o primeiro caso não executado.
Essas ações não gravam resultados automaticamente. O E2E testa os focos
e o fluxo completo com a seção secundária expandida. Ver também
\`docs/FLUXO_RAPIDO_QA_REACT.md\` e o checklist de homologação assistiva.

O comportamento e o desempenho ainda precisam de avaliação humana com
QAs reais. Não inferir redução de tempo sem medir o antes/depois.

## Criar TF e continuar diretamente nos cenários

O formulário de nova TF permite **Salvar e abrir TF** ou **Salvar e
adicionar cenário**. A segunda opção abre o primeiro formulário de
caso sem gravar um cenário vazio. O foco começa no título, e o
parâmetro temporário de navegação é descartado após ser utilizado.

Para escrever vários casos seguidos, **Salvar e criar outro**
salva um caso pendente e mantém o editor aberto, limpo e com foco
no título seguinte. O fluxo não aprova casos, não executa testes
e não altera status automaticamente.

Teste sintético: `frontend/tests/browser-quick-create.mjs`.
Critérios de aceite QF09–QF12 em `docs/FLUXO_RAPIDO_QA_REACT.md`.

## Trava de publicação durante o rollout seguro

Novas TFs públicas são **bloqueadas por padrão** no frontend React.
O botão de publicar informa que a homologação de segurança é necessária.
A opção de **retirar publicação** permanece disponível para o autor caso a
TF já esteja pública. O código também recusa publicar quando a flag está
desligada, mesmo que uma função seja acionada sem passar pelo botão.

Somente após: instalar as RPCs `qa_public_tasks_v1` /
`qa_public_task_v1`, migrar os dois leitores (React e legado), aplicar
o lockdown das tabelas e obter testes aprovados com contas reais em
staging, usar `VITE_PUBLIC_SHARING_ENABLED=true` no build autorizado.
A flag do cliente é apenas uma trava operacional; o banco continua sendo
responsável pela autorização.

A CI de navegador testa publicação com flag ativada **somente no build
sintético**; os builds normais e de release seguem com publicação desativada.
O acesso público legado não é bloqueado por essa flag. Consulte
`docs/HOMOLOGACAO_SUPABASE_STAGING.md` e
`supabase/qa_public_read_audit.sql`.

### Verificação real do build de publicação

A CI Chromium gera **dois builds separados**. Primeiro habilita
`VITE_PUBLIC_SHARING_ENABLED=true` somente no ambiente sintético (com
requisições Supabase interceptadas por Playwright) para testar publicação
e retirada de publicação. Depois executa `npm run build` sem a flag
— equivalente ao padrão de release — e valida novamente em Chromium
que **Publicar TF** fica desativado, nenhum PATCH de publicação é enviado e
**Retirar publicação** permanece utilizável.

O teste `frontend/tests/browser-publication-gate.mjs` usa fixtures sem
dados reais e não exige credenciais. O executor
`frontend/tests/browser-suites.mjs` executa cada smoke de navegador
isoladamente e acumula falhas: um erro na IA/extrator não impede os testes
posteriores de autorização, acessibilidade e compartilhamento.


## Recuperação opcional de rascunho de nova TF

No cadastro rápido, existe a opção **Guardar rascunho somente nesta
aba**. Ela fica **desmarcada por padrão**: não armazena
automaticamente textos internos no navegador. Quando marcada, preserva
o título, descrição, código, tipo, módulo e versão em
`sessionStorage` (não `localStorage`), separadamente por ID da conta.
Um rascunho válido pode ser **recuperado** ou **descartado**
explicitamente após atualizar a página. O conteúdo não é restaurado
automaticamente por cima de outro formulário.

A cópia local é eliminada após salvar a TF com sucesso, ao desativar
a opção, ao escolher Descartar rascunho, ao sair explicitamente da
conta, ou quando expira (24 horas). Não guardamos anexos, credenciais,
tokens, seleções de cenários extraídos nem campos avançados. O
armazenamento pode falhar no modo privado ou por restrições do
navegador, e o app informa a falha. O formulário confirma antes de
descartar alterações não preservadas pelo usuário.

**Privacidade:** este recurso não é criptografia. Scripts com acesso
à mesma origem podem acessar `sessionStorage`; não use essa opção em
dispositivos compartilhados ou para texto com segredos. Se o
navegador encerrar a sessão da aba, a cópia pode desaparecer.
A recuperação é conveniência local, não backup no servidor.

Validação: `frontend/tests/local-draft.test.ts` (versão,
expiração, ausência de campos extras e isolamento entre contas),
`frontend/tests/browser-draft-recovery.mjs` (consentimento, refresh,
restauração explícita, escrita pendente no `pagehide`, descarte
e mobile 390px). Somente fixtures sintéticas, sem escrita no Supabase.


## Execução contínua de cenários pendentes

Quando o QA usa **Testar pendentes**, uma execução confirmada pelo servidor
move o foco para o botão **Funcionou** do próximo cenário pendente.
Ao concluir o último caso, o foco retorna ao filtro **Pendentes**.
Se o Supabase recusar o salvamento, os cenários não avançam
automaticamente e a falha continua visível para tentativa posterior.

Ao mudar um cenário de **reprovado/bloqueado** para **aprovado**, a
observação antiga da falha **não é reaproveitada** como se fosse
resultado de uma aprovação. Se houver texto observado que seria
substituído, o sistema exige uma confirmação explícita; cancelar
mantém o registro anterior. A mesma proteção vale para desfazer a
execução. Uma aprovação já existente conserva sua observação escrita
manualmente se for registrada novamente como aprovação.

Os testes continuam exclusivamente vinculados ao cenário; não
marcam automaticamente a TF inteira como aprovada. Há cobertura
unitária em `frontend/tests/quick-result.test.ts` e Chromium
sintético em `frontend/tests/browser-execution-next.mjs`, incluindo
falha de rede, preservação de dados, avanço de teclado e layout mobile.


## Conclusão da TF — resumo fiel de "O que foi testado"

A ação **Conferir relatório** foi incluída no fluxo rápido da TF e
abre, com foco de teclado no título, o painel de **Documentos /
relatório** já existente. Não foi criado outro gerador nem incluída
uma migração de banco.

A seção **O que foi testado** é derivada exclusivamente dos cenários
com status salvo `aprovado`, `reprovado` ou `bloqueado`; pendentes
não entram no resumo e continuam identificados como não executados
nos detalhes do relatório. São preservados título, passos previstos,
resultado esperado e resultado observado realmente registrado.
Uma aprovação sem descrição do resultado observado é identificada
explicitamente como tal, sem inventar evidência.

O resumo é copiável, e o relatório completo pode ser revisado,
baixado em Markdown ou salvo como uma nova versão privada via RPC
já existente. Quando o QA edita o texto, atualizações posteriores
dos casos **não sobrescrevem sua edição**; o botão
**Atualizar prévia** pede confirmação antes de substituí-la.
Um documento vazio não é salvo. Gerar ou salvar relatório
**não altera automaticamente o status da TF**, e as conclusões
apresentadas são sugestões para revisão humana.

Cobertura: `frontend/tests/execution-summary.test.ts` e
`frontend/tests/browser-report-summary.mjs` (Supabase simulado:
cópia fiel de resultados, cenário pendente, revisão manual,
recalcular, salvar versão e viewport mobile).


## Retomar testes direto da lista de TFs

A lista operacional mostra para cada TF visível quantos **cenários
têm resultado persistido** (`aprovado`, `reprovado`, `bloqueado`)
e quantos estão `nao_executado`. A situação global da TF **não** é
usada para inferir esse progresso.

O progresso é consultado em lotes de até 20 IDs de TF, exclusivamente
com as colunas `tarefa_id,status`, respeitando RLS. O cliente
pagina resultados em blocos de 500 para não contar silenciosamente
apenas a primeira página do PostgREST. A lista exibe inicialmente 30
TFs e permite **Mostrar mais TFs**. Se a consulta de progresso falhar,
as TFs continuam navegáveis e não são exibidos números estimados.
Após salvar uma execução, a consulta de progresso é invalidada.

Para TFs próprias com cenários pendentes, o atalho
**Continuar testes** abre a mesma TF com filtro **Pendentes** e foco
no primeiro resultado disponível. A intenção de navegação é consumida
com `replace`, portanto atualizar a página não reinicia o fluxo.
Para uma TF sem casos, **Adicionar primeiro caso** abre apenas
o formulário de criação. Administradores podem consultar outras TFs,
mas **não recebem atalhos de execução** em registros de terceiros.
Abrir o atalho nunca grava resultados ou altera a situação da TF.

Validação: `frontend/tests/task-progress.test.ts` e
`frontend/tests/browser-home-progress.mjs` com contas/linhas
fictícias, cenários paginados, tarefa de terceiro e viewport 390px.
Não substitui a homologação com Auth/RLS e dados representativos.


## IA restaurada: casos, posts e diagramas diretamente na TF

Na página da TF, **Gerar casos com IA** e **Gerar post com IA** são
ações principais, não mais controles escondidos no menu secundário.
Elas reutilizam a Edge Function `qa-generators` já existente,
com streaming, contexto revisável, consentimento prévio, checagem
de formatos, revisão humana, anexação atômica de cenários pendentes
e versionamento de posts em Documentos.

O novo botão **Gerar diagrama com IA** abre o editor de diagramas
Mermaid com o assistente nativo React. Ele utiliza a função
Supabase `qa-ai` que já estava implantada e que aceita
`{ mode: "diagram", text }`; não foi criado outro endpoint
nem uma migration de banco. O analista pode escolher dados da
TF, até 18 cenários, requisitos aprovados ou apenas texto livre.
A interface mostra o conteúdo que será enviado à NVIDIA e
solicita consentimento explícito antes de chamar a IA.
Identificadores conhecidos (emails, CPF/CNPJ, tokens) são
mascarados pelo utilitário de contexto; isso **não substitui**
a revisão humana do texto.

O retorno é validado e normalizado pelo sanitizador de Mermaid
legado, preparado no editor e renderizado em um `iframe sandbox`
sem permissões. Existe fallback local caso o modelo não produza
um diagrama utilizável. **Gerar não salva, publica ou aprova
qualquer dado**: é necessário revisar e clicar `Salvar diagrama`.
Somente o proprietário recebe o direito de gerar, criar, editar
ou remover diagramas. O backend continua protegido por JWT,
quota de IA e RLS do Supabase.

A tela de TF também tem uma nova visão de resumo com métricas
de execução persistida, acesso direto às três ferramentas de IA
e configurações administrativas posicionadas após o fluxo de
testes. Os casos não executados continuam sendo pendentes,
sem aprovação automática.

Testes: `frontend/tests/diagram-ai.test.ts` para seleção,
limites de contexto, privacidade e Mermaid seguro;
`frontend/tests/browser-ai-workbench.mjs` para consentimento,
botões visíveis, revisão, salvamento explícito e responsividade
em 390px. Os testes Chromium usam fixtures sintéticas.


## Recuperação de erros de sintaxe Mermaid

A geração de diagramas pela Edge Function `qa-ai` usa um prompt com
gramática mínima validada contra Mermaid v12: `flowchart LR`,
IDs alfabéticos únicos, nós separados das arestas, textos de nós
entre aspas, uma seta por linha e sem HTML, estilos, subgrafos ou
instruções executáveis. O contexto original é tratado como dado.

O React passa o resultado por `mermaid.parse()` antes de colocá-lo
no editor. Se o parser rejeitar a sintaxe, a tela **não salva**
automaticamente: preserva o código e a mensagem de erro para revisão,
oferece **Corrigir com IA** (reenvia código rejeitado e diagnóstico)
e **Gerar novamente** (nova tentativa a partir do contexto original).
Também é possível editar o código manualmente.

O botão `Salvar diagrama` valida novamente a sintaxe no navegador;
Mermaid inválido não é gravado. Corrigir e regenerar são chamadas
novas à `qa-ai`, sujeitas à autenticação, consentimento explícito
e quota existente. O botão de correção não roda sozinho, e a
atualização do editor continua pedindo confirmação antes de substituir
um rascunho. Não há alteração em dados, tabelas ou políticas RLS.

Fonte do prompt e backend: `supabase/functions/qa-ai/`. As
alterações de prompt devem ser implantadas explicitamente como nova
versão da função. As suítes de regressão incluem
`tests/qa-ai-diagram-prompt.test.mjs`,
`frontend/tests/mermaid-validation.test.ts` e o browser
`frontend/tests/browser-ai-workbench.mjs`.


## UX da nova versão — janelas modais unificadas

A página da TF permanece dedicada aos cenários e resultados de execução.
Criação de TF, edição, casos, anotações de falha/bloqueio,
configurações/publicação e todas as ferramentas de apoio agora abrem
**modais padronizados**. Os painéis de posts, casos com IA, documentos,
diagramas, requisitos, evidências e vínculos não ficam mais empilhados
entre os cenários.

`src/components/ui/QAModal.tsx` é o contrato visual comum: portal
fora do elemento `#root`, fundo inerte, trava de Tab, Escape, retorno
do foco, rolagem interna e tamanhos responsivos (no celular, janela
ocupando toda a tela). Fechamento que descartaria TF ou cenário
não salvo exige confirmação. Geradores e documentos conservam os
contratos de persistência existentes; **fechar um modal nunca é uma
operação de salvar ou de concluir testes**.

Painéis longos de documentos, diagramas e rastreabilidade mantêm seus
rascunhos na memória enquanto a TF continua aberta, mesmo depois
de fechar/reabrir o modal. Não persistem no banco até o salvamento
explícito. Voltar à lista de TFs pode descartar o rascunho não salvo.

A criação rápida mantém o rascunho opcional por aba, a importação
local e os dois caminhos `Salvar e abrir TF` e
`Salvar e adicionar cenário`. O fluxo de resultados permanece
rápido: `Funcionou` grava resultado de teste; `Não funcionou`
e `Bloqueado` exigem texto observado em um modal.

Tabelas/buscas operacionais continuam visíveis fora dos modais,
pois esconder a lista de TFs prejudicaria a produtividade.
A interface administrativa não expõe ações de edição de
cenários pertencentes a outras contas.


## UX mobile simplificada (novembro/2026)

**Objetivo:** diminuir as ações e a leitura exigidas para executar QA no
celular, mantendo os mesmos dados e regras de autorização.

A página inicial agora mostra três indicadores compactos e a lista de TFs.
Na TF, os números da execução ficam em uma linha, os botões principais
são **Cenário**, **Testar pendentes** e **Relatório**. As ferramentas de IA
estão disponíveis em três acessos (Casos de teste, Post e Diagrama).
Requisitos, releases, evidências e editor avançado ficam em
**Mais ferramentas**. No celular há uma única navegação e um botão de
sair sempre acessível, em vez de dois cabeçalhos.

### Novo fluxo de diagrama

1. Abra **Diagrama** na TF.
2. Use **Dados da TF** (padrão) ou **Texto livre**.
3. Confira os dados opcionais e marque a autorização para enviar à NVIDIA.
4. Clique **Gerar fluxograma com IA**. O diagrama validado aparece na prévia.
5. Clique **Salvar diagrama** quando estiver correto.

**Personalizar conteúdo**, **Ver dados enviados**, **Editar título ou
código Mermaid** e **Diagramas salvos** são opções recolhidas. O usuário
não precisa conhecer Mermaid para a operação básica, mas mantém
correção com IA, regeneração e edição manual quando necessário.

A autorização continua explícita e é reiniciada quando o texto enviado
muda. Nenhum salvamento, publicação ou conclusão de testes é automático.
Em caso de erro do parser, o código inválido não é gravado. Os campos e
dados continuam vinculados à conta e protegidos pelas mesmas RLS.

### Evidência visual e responsividade

A suíte `frontend/tests/browser-ai-workbench.mjs` testa o acesso à TF
e ao modal de diagramas em 320, 390, 768 e 1366 pixels: detecta
overflow horizontal, largura do modal, alvos de toque, controles
ocultos e consentimento. Capturas PNG sintéticas, sem dados reais, são
geradas em `frontend/artifacts/mobile-ux/` e disponibilizadas como
artefato da Action `QA Hub React browser smoke`.
