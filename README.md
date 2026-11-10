# QA Hub

Sistema de gerenciamento de testes de software, desenvolvido com **React 19, TypeScript e Vite**. A autenticação, os dados e as permissões utilizam Supabase.

**Aplicação:** https://kaina-visualsoftware.github.io/QA-Hub/

A raiz encaminha para **/QA-Hub/react/**. Não há mais uma segunda interface de gerenciamento.

## Áreas do React

| Rota | Funcionalidade |
| --- | --- |
| #/ | Lista e criação de TFs |
| #/tarefa/{id} | Cenários, execução, requisitos, relatórios, IA, diagramas e evidências |
| #/painel | Indicadores |
| #/ferramentas | Releases e comparações de texto/XML |
| #/documentacoes | Manuais, soluções, notas e documentos privados ou públicos com anexos |
| #/perfil | Conta, menu e equipes |
| #/publicas | Biblioteca de TFs publicadas |
| #/admin | Consulta administrativa autorizada |
| /react/auth.html | Callback de autenticação |

Posts e casos de teste são gerados dentro de cada TF. Não existe um gerador avulso com interface independente.

## Compatibilidade de URLs antigas

- **index-legacy.html, qa-legacy.html, public.html e geradores.html:** somente redirecionadores leves. Não carregam formulários, menus, dados nem scripts da aplicação antiga.
- **public.html?tf=UUID:** preserva o identificador e abre o registro correspondente na biblioteca React.
- **qa.html:** gateway de autenticação mantido para links já enviados por e-mail. Preserva tokens e códigos para o callback em /react/auth.html.
- **index.html:** redireciona para o React preservando as rotas conhecidas.

Não retire a URL antiga de callback das configurações permitidas no Supabase antes de confirmar que todos os links enviados anteriormente expiraram ou foram substituídos.

## Estrutura do projeto

- **frontend/src/**: código ativo da interface React.
- **frontend/tests/**: testes unitários e de navegador com respostas simuladas do Supabase.
- **frontend/src/lib/legacy/**: regras funcionais reaproveitadas, sem telas antigas.
- **supabase/**: scripts SQL, funções e políticas de autorização.
- **react/**: bundle do GitHub Pages, gerado por GitHub Actions. **Não editar manualmente.**
- **tests/** e módulos qa-*.mjs da raiz: regras de negócio e testes de paridade ainda mantidos para evitar perda de cobertura. Não são telas públicas.

O workflow qa-react-publish.yml publica a SPA e preserva assets versionados de releases anteriores para evitar erros em abas já abertas.

## Desenvolver

Requer Node.js 22+.

Na pasta frontend:

    npm ci
    npm run dev
    npm run typecheck
    npm run lint
    npm test
    npm run build

No Windows, se o PowerShell bloquear npm.ps1, execute npm.cmd no lugar de npm.

## Auditoria da interface

A auditoria de rotas e estados inclui login, cadastro, recuperação, lista de TFs, detalhes, modais, dashboard, ferramentas, perfil, biblioteca pública e acesso administrativo negado. Capturas e verificações de overflow e acessibilidade são geradas no workflow de auditoria visual.

Para repetir no computador local, instale Playwright e Chromium e inicie o preview da pasta frontend:

    npm run preview -- --host 127.0.0.1 --port 4173
    node tests/browser-accessibility.mjs

Os testes usam dados **simulados**; não substituem homologação de integração NVIDIA, Supabase real, RLS entre contas ou dispositivos físicos.

## Segurança

Os dados publicados devem ser consultados somente pelas RPCs qa_public_tasks_v1 e qa_public_task_v1. Não reabilite leitura anônima direta das tabelas operacionais nem armazene credenciais privilegiadas no frontend.

A visibilidade pública é definida uma única vez na TF e herdada por imagens, arquivos, fontes, requisitos, documentos e demais conteúdos vinculados. A implantação exige a migração e a função descritas em [Padrão de interface e visibilidade](docs/PADRAO_INTERFACE.md).

A remoção da antiga interface não apaga tarefas, arquivos, históricos nem informações do Supabase.

## Histórico

Arquivos anteriores em docs/ descrevem fases de migração e podem citar telas que foram removidas. Para rotas e comandos atuais, siga este README.

A área Documentações e sua migração estão descritas em [Documentações e ferramentas](docs/DOCUMENTACOES.md).
