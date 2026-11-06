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
somente uma TF marcada `publica=true` e consulta apenas os campos
explicitamente selecionados do resumo, dos cenários e dos diagramas.
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
