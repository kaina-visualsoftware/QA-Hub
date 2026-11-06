# Issue 37 — migração incremental React

Branch: feat/issue-37-react-foundation. Produção preservada em qa.html.

## Inventário de paridade

| Funcionalidade | Migração React | Pendência |
| --- | --- | --- |
| Login/cadastro/sessão | AuthProvider | Homologar callback e RLS |
| Recuperação de senha | AuthProvider | Redirecionamento para SPA no corte |
| TFs: listagem/busca/filtro | Workspace | Paginação server-side |
| Cadastro de TF como rascunho | Workspace | Extração local/IA |
| Edição de dados básicos | TaskPage | Campos adicionais, exclusão |
| Adicionar cenário | TaskPage | Editar e excluir cenário |
| Aprovar/reprovar/bloquear cenário | TaskPage | Execução E2E Supabase real |
| TF em foco | Zustand por conta | Validar navegação direta |
| Gerador de testes/posts | Link para qa.html | Migrar geradores.html e #31 |
| Diagrama Mermaid | Link para qa.html | Migrar viewer/editor com segurança |
| Requisitos R1–R4 | Legado | Migrar módulos com rastreabilidade |
| Documentos/evidências/auditoria | Legado | Migrar Phase2/3/4 |
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
