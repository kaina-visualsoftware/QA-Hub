# Issue 37 — migração incremental React

Branch: feat/issue-37-react-foundation. Produção preservada em qa.html.

## Inventário de paridade

| Funcionalidade | Migração React | Pendência |
| --- | --- | --- |
| Login/cadastro/sessão | AuthProvider | Homologar callback e RLS |
| Recuperação de senha | AuthProvider | Redirecionamento para SPA no corte |
| TFs: listagem/busca/filtro | Workspace | Paginação server-side |
| Cadastro de TF como rascunho | Workspace | IA NVIDIA e modelo local |
| Edição de dados básicos | TaskPage | Campos adicionais, exclusão |
| Adicionar/editar/excluir cenário | TaskPage | Evidências vinculadas |
| Aprovar/reprovar/bloquear cenário | TaskPage | Execução E2E Supabase real |
| TF em foco | Zustand por conta | Validar navegação direta |
| Gerador de testes/posts | GeneratorPanel + Edge Function | Fluxo principal migrado; faltam modos alternativos e histórico avançado |
| Diagrama Mermaid CRUD + prévia isolada | DiagramPanel (lazy) | Geração por IA, zoom avançado |
| Requisitos R1–R4 | Legado | Migrar módulos com rastreabilidade |
| Posts/relatórios versionados | DocumentsPanel + RPC | Migração básica feita; evidências/auditoria seguem no legado |
| Release, diff, XML | Legado | Migrar ferramentas locais |
| Admin, visibilidade e página pública | Supabase e legado | Migrar UI/guards |
| Links antigos e callback de Auth | qa.html/index.html mantidos | Compatibilizar no corte |

## Arquitetura e decisão visual provisória

React 19, TypeScript strict, Vite 8, Tailwind v4, TanStack Query,
TanStack Router (hash), Zustand, Zod, React Hook Form e HeroUI v3.
HeroUI fornece botões acessíveis e tokens; componentes operacionais de QA
são leves e semânticos. Flowbite React foi considerada mas adiciona setup
extra de plugin/classes. A decisão só será ratificada após POC comparativa
em navegador com teclado, acessibilidade e métricas de bundle.

## Segurança

Reutiliza a URL/chave publicável existentes, sem service_role e sem migração de
banco. Supabase RLS é a autorização real. Mutação exige ação explícita do
testador, e cenários criados ficam nao_executado. Um cenário reprovado ou
bloqueado requer relato do resultado observado. O status geral da TF
não muda automaticamente. Query keys incluem usuário, foco não guarda coleções.

## Validação e rollout

Os checks previstos são typecheck, lint, Vitest e build; CI do PR deve informar
sucesso real. É necessário estabelecer baseline de rede, LCP/INP, tempos de
interação, screenshots 390/768/1366 e E2E com dados sintéticos e duas contas
Supabase. Não existem números de performance medidos neste incremento.

Não fazer deploy até paridade e homologação. Para rollback futuro, restaurar
o workflow de deploy dos arquivos HTML/JS legados e manter qa.html e callbacks
autorizados no Supabase.

## Incrementos implementados e verificados

- Fundação React, sessão e núcleo de TFs/cenários, PR #39.
- Parser puro existente copiado sem alteração para a SPA; revisão local antes
  de cadastrar cenários, todos começam não executados.
- Situação da TF é alterada apenas pelo testador; edição e exclusão com confirmação.
- CRUD de diagramas em React, Mermaid importado somente ao abrir a prévia;
  visualização de SVG em sandbox sem permissão de script, sem iframe da ferramenta legada.
- CI de tipo, lint, testes e build passou para commit eedc1425.

**Não homologado:** rede com Supabase real, permissões em duas contas,
leitor de tela, comparação visual HeroUI/Flowbite, performance antes/depois,
importação transacional, migração dos módulos legados faltantes. A PR é draft.

## Incremento seguinte — geradores e documentos em React

- O TaskPage agora abre geradores nativos para post e roteiro, vinculados à TF
  selecionada. Os dados de apoio são recuperados por TF e conta autenticada.
- O contexto consolida cenários já cadastrados, documentos, evidências e eventos
  (somente metadados textuais); fontes indisponíveis são apresentadas. Não ocorre
  corte silencioso de texto acima dos limites da Edge Function.
- Requisitos aprovados são selecionáveis; a chamada à NVIDIA exige consentimento
  explícito e prévia textual do contexto saneado. A função de IA existente
  mantém JWT, quota e segredos no Supabase, nunca no frontend.
- O streaming SSE é interpretado com limites, conclusão e tratamento de erros;
  respostas parciais não são confundidas com sucesso.
- O post segue `qa-post-format.mjs` legado e só pode ser salvo com estrutura
  aprovada, usando RPC de documento versionado; roteiro é revisado por campo
  e anexado via `qa_attach_generated_cases` transacional e idempotente.
- Casos novos ficam `nao_executado`; registro de resultados de execução
  continua sendo ato do testador.
- Posts, relatórios, versões e exportação Markdown passam a ter interface
  React. Geração de relatório usa dados persistidos, sem aprovação automática.
- A coluna de análise técnica e conclusão foi restaurada ao formulário de edição
  para preservar o contexto dos geradores.
- Falhas de persistência de histórico ou rastreabilidade são mostradas, sem
  apagar a revisão ou a TF.

**Limitações restantes:** revisão completa das fases de requisitos R1–R4,
edição/zoom avançado Mermaid, IA local no navegador, visualização pública,
liberação de evidências, auditoria e release/diff/XML. Segurança real RLS,
contas de homologação, acessibilidade assistiva, comparação de performance
e corte de produção permanecem pendentes.

## Reprodutibilidade de dependências

O lockfile npm v3 foi gerado em GitHub Actions com Node.js 22, contém 400
entradas de pacote e está versionado na branch. As verificações de frontend
executam `npm ci` antes de tipagem, lint, testes e build. Não foram adicionadas
chaves privadas nem dependências de runtime para este procedimento.

## Validação recente — 06/11/2026

Head validado: `86a154e9f0ebafdf91d266faea063b132e265c6d`.

- `QA Hub React foundation`: **aprovado** com `npm ci`, TS strict,
  ESLint, Vitest e Vite production build.
- `QA Hub React browser smoke`: **aprovado** no Chromium. O login,
  a mudança de modo, 390/768/1366 px e o E2E autenticado sintético
  foram exercitados. Não se usaram contas ou dados reais.
- E2E sintético exercitado: login → selecionar TF → conferir consentimento
  de IA → gerar roteiro → revisar → anexar caso (ainda não executado) →
  gerar post → salvar versão privada. Verifica que a IA não grava resultados
  nem altera o status geral da TF.
- `QA Hub checks` e `QA Hub browser smoke` legados: **aprovados**,
  confirmando que o HTML/JS existente não foi quebrado pelo novo frontend.
- Ainda pendente: Supabase real em duas contas com RLS, leitor de tela,
  cobertura visual autenticada e testes com a Edge Function NVIDIA real.

### Primeira medição de bundle, sem inferir performance real

Extraída do `vite build` no GitHub Actions; valores são tamanhos dos
artefatos, **não** bytes efetivamente transferidos ou indicadores Core Web Vitals.

| Chunk | Minificado | gzip | Observação |
| --- | ---: | ---: | --- |
| Entrada `index` | 780,66 KB | 233,57 KB | Otimização necessária |
| `TaskPage` | 18,59 KB | 5,40 KB | Importado sob demanda |
| `GeneratorPanel` | 30,95 KB | 11,71 KB | Importado sob demanda |
| `DiagramPanel` | 6,61 KB | 2,82 KB | Importado sob demanda |
| Subchunk Mermaid ELK | 1.498,94 KB | 465,89 KB | Diagramas pesados; avaliar redução sob demanda |

Antes da publicação definitiva, comparar com a rede do legado, medir LCP/INP,
interações, uso de memória, latência das queries e possíveis chunks de vendor
não utilizados. Não trocar para outra biblioteca apenas por presunção.

## Requisitos R1–R4 em React — incremento de 06/11/2026

- **R1**: `RequirementsPanel` permite colar texto de especificação,
  organizar via `qa-requirements.mjs`, revisar campo a campo, marcar
  os selecionados como aprovados e importar via RPC transacional.
  A edição e o arquivamento preservam as revisões existentes.
- **R4**: painel de cobertura usa `calculateRequirementCoverage` e os
  vínculos efetivamente persistidos. A matriz distingue vinculação de
  execução/validação, oferece associação manual de cenários por RPC
  e exporta CSV com proteção contra fórmulas de planilhas.
- **R2**: listagem e download de fontes originais privadas;
  upload com verificação local de cabeçalho, SHA-256, nome, tamanho,
  MIME e registro no Storage/RPC sem substituir versões.
  TXT/MD/PDF/DOCX são lidos localmente; PDF.js e JSZip entram via importação
  dinâmica, com limites de 200 páginas, 10 MB de arquivo, 30 mil caracteres
  de prévia e 1.000 entradas ZIP. O arquivo original é preservado integral.
  Documentos sem texto extraível exigem transcrição manual (sem OCR).
- **R3**: consulta somente leitura ao histórico de revisões exatas
  selecionadas nas gerações, sem expor binários de anexos.
- Requisitos permanecem **privados para o proprietário da TF**; a
  consulta administrativa não habilita a edição de requisitos de terceiros.
- A migração reutiliza migrations existentes e não executa SQL novo.

Pendente: homologação real de RPCs, teste de upload/download no Storage e
validação de RLS com duas contas antes do corte. Os fluxos R1/R4 e a
extração local PDF/DOCX já possuem smoke tests sintéticos no Chromium.

## Evidências e auditoria — extensão da migração React

- `EvidencePanel` permite salvar evidência textual/URL HTTPS opcional, vinculada
  à TF ou a um cenário. Usa o validador legado `qa-phase4.mjs`, a tabela
  `qa_evidencias` e o gatilho de auditoria existente (sem migração SQL nova).
- Histórico de evidências é somente leitura, sem operações UPDATE/DELETE; os
  eventos `qa_eventos` são apresentados com os rótulos do legado e paginação
  progressiva. A leitura da auditoria também não permite alterar eventos.
- Exige a TF própria para cadastrar evidências; referências com características
  evidentes de credenciais/token na URL são rejeitadas no cliente.
- Pendência: validar com Supabase real, duas contas/RLS e prova de acessibilidade.

## Fase 3 — releases e referências em React

- A TF pode ser associada a uma versão confirmada via `qa_link_release`,
  mantendo RLS e sem alterar automaticamente a situação da TF.
- Referências técnicas privadas são cadastradas via os validadores legados
  `qa-phase3.mjs`, com cópia e exclusão explicitamente confirmada.
- Contadores salvos de comparação texto/XML podem ser consultados; não são
  exibidos nem persistidos textos/arquivos originais nesse painel.
- Pendências: testes com contas Supabase reais, XML com namespaces complexos
  e homologação do fluxo.

## Ferramentas locais da fase 3 — comparação e release

- `qa-release-core.mjs` foi copiado como módulo puro reutilizado pela interface
  React, mantendo o algoritmo linha-a-linha e a comparação estrutural XML.
- `ComparisonTool`: texto/XML local; prévia paginada de diferenças,
  tamanho máximo de entradas, bloqueio de DTD/ENTITY/xml-stylesheet e
  renderização React como texto (nunca HTML da entrada).
- `recordComparison` é chamado somente após ação e confirmação do QA;
  o corpo enviado à tabela `qa_artefatos` contém apenas TF, usuário, tipo
  e as contagens, sem payload original.
- `ReleaseOrganizer`: classifica status 11/12, organiza a lista autorizada,
  revisa comunicado/BBCode e apresenta advertências. Códigos encontrados
  não implicam vínculo automático; `qa_link_release` permanece separado.
- Paridade ainda demanda homologação com entradas reais (principalmente
  XML com namespaces complexos) e auditoria de acessibilidade/performance.

## Extração de documentos e comparação local — validação de 06/11/2026

- `pdfjs-dist@6.5.438` e `jszip@3.10.2` fixados no manifest e no lockfile,
  gerados com `npm install` + `npm ci` no GitHub Actions. O workflow
  temporário de atualização do lockfile foi excluído.
- `read-document-text.ts`: leitura PDF/DOCX no navegador, imports e worker
  carregados sob demanda, sem CDN de terceiros em tempo de uso.
- PDF com limite de 200 páginas e somente texto extraível; DOCX com
  verificação de estrutura ZIP, CRC, limite de entradas e do XML expandido,
  rejeitando DTD. Prévia limitada a 30.000 caracteres, original integral
  conservado para upload privado somente após confirmação do QA.
- O smoke Chromium com **PDF e DOCX sintéticos** confirmou a extração
  local e ausência de upload automático. O E2E também cobre diff texto/XML,
  bloqueio de DTD e registro de **somente contagens** após confirmação.
- `npm ci`, TypeScript, lint, Vitest, bundle e smoke Chromium: aprovados
  no incremento `e1e39da5`. O legado e a publicação atual não mudaram.
- Medição de artefatos no build (tamanho bruto, não tráfego): PDF.js 444,23 KB;
  worker PDF 2.248,83 KB; JSZip 95,93 KB; entrada principal 785,30 KB
  (gzip 234,72 KB). Imports sob demanda não equivalem a medição real de
  latência ou carregamento.
- **Pendente:** teste com arquivos PDF/DOCX reais e malformados, RLS com
  duas contas, upload/download real de Storage, acessibilidade e performance.
  PDF digitalizado continua exigindo OCR externo/transcrição.
