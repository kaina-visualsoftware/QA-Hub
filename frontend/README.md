# QA Hub React — issue #37 (incremento inicial)

A pasta frontend/ contém a nova SPA e NÃO substitui o site público durante a
migração. O legado qa.html permanece ativo para IA, diagramas e relatórios.

## Desenvolvimento

Requer Node 22.12+. Execute na pasta frontend/: npm install, npm run dev,
npm run typecheck, npm run lint, npm test e npm run build.
A base Vite do build é /QA-Hub/. Valores públicos do Supabase reutilizam qa-config.js.
Variáveis VITE_ opcionais são descritas em .env.example; nunca incluir service_role,
sb_secret_ ou tokens de provedores no cliente.

O incremento traz Auth, listagem/busca de TFs, criação rápida, edição básica,
cenários, execução manual, edição/exclusão de registros e diagramas Mermaid nativos (lazy). Estados remotos usam TanStack Query; foco local,
Zustand; validação, Zod/React Hook Form. Nenhuma aprovação automática via IA.

Pendências: paridade de IA, histórico, documentos, geração de diagramas por IA,
requisitos, callbacks de produção, testes RLS com contas reais,
acessibilidade e desempenho. package-lock.json deve ser gerado e versionado
em ambiente com acesso ao registry antes do corte de produção.

## Testes do primeiro incremento

O workflow React instala dependências, executa verificação TS estrita, ESLint,
Vitest e build. O smoke do navegador mede renderização de login, mudança de
modo e ausência de rolagem horizontal em 390/768/1366 px, sem acessar contas reais.
As suites de browser e de dados reais são verificações distintas.

Importações locais reutilizam qa-parser.mjs, exigem revisão de cenários
explícitos e não registram aprovação automática. Erro de anexação mostra alerta
após abrir a TF salva; não há transação atômica neste estágio.
