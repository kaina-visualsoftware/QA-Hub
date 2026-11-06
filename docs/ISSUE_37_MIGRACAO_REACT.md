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
