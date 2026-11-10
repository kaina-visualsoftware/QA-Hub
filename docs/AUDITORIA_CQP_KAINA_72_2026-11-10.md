# Auditoria da interface — CQP-KAINA-72
Data: 10 de novembro de 2026

## Ambiente e método
- Máquina autorizada: CQP-KAINA-72, Windows, Node.js 24.20.
- Checkout isolado do repositório QA-Hub; sem alterar pastas de projetos pessoais.
- Chromium por Playwright, renderização do frontend React compilado e backend Supabase sintético.
- Skills aplicadas como checklist: Impeccable, acessibilidade, revisão de código, qualidade web, design frontend e Playwright.
- Viewports principais: 320, 390 e 1366 px; testes de modal incluem 768 px.
- Critérios: overflow horizontal, WCAG AA com axe-core, estados de foco, autenticação, criação, execução, publicação, redirecionamento, feedback de IA e controle de persistência.

## Cobertura por tela

| Área | Estados exercitados |
| --- | --- |
| Autenticação | Login, cadastro, recuperação e callbacks |
| Tarefas | Listagem, filtros, pesquisa, criação em etapas e rascunhos |
| TF | Detalhes, edição, cenários, execução guiada e em lista |
| Recursos | Requisitos, cobertura, documentos, evidências, releases e equipe |
| IA | Geração de casos, post e diagrama, consentimento, streaming e revisão |
| Visão geral | Indicadores, distribuição e progresso |
| Ferramentas | Releases, comparações e informações |
| Perfil | Preferências da navegação, gerenciamento de equipes |
| Biblioteca pública | Listagem, detalhe e visualização Mermaid |
| Administração | Estado de acesso restrito para usuário não autorizado |
| URLs antigas | Home, QA, biblioteca pública, geradores, auth e deep links |

Os testes de acessibilidade e overflow na rotina browser-accessibility.mjs concluíram sem violações nos estados examinados. As capturas do Chromium foram revisadas para ferramentas e perfil no desktop e para dashboard, ferramentas e perfil em 320 px.

## Alterações realizadas
- Removido da navegação React o acesso redundante à versão antiga.
- Arquivos HTML antigos substituídos por redirecionadores leves, preservando entradas e links previamente enviados.
- Retirados entrypoints JavaScript, CSS e componentes de interface legada sem consumidores ativos.
- Preservadas funções de domínio e testes de paridade ainda necessários.
- Corrigido o indicativo de rolagem da navegação móvel sem acrescentar outra linha de menus.
- Ajustado o texto de ação ao anexar casos: quantidade e singular/plural coerentes.
- Atualizados testes de navegador que dependiam da navegação flutuante antiga, de texto de botão anterior e de escopo antigo dos toasts.
- O teste de redirecionamentos reproduz no navegador os links antigos, inclusive token de recuperação e TF pública.
- Documentação principal atualizada para descrever somente a arquitetura React.

## Limitações e cuidados
- A auditoria em conta real e a execução da NVIDIA de produção não foram realizadas; os testes usam respostas sintéticas.
- O estado administrativo autorizado depende de fixture e política real; a auditoria da rota sem privilégio não certifica permissões com uma conta administrativa real.
- O teste de acessibilidade automatizado não substitui leitor de tela, testes com toque físico nem análise de todos os estados de formulários possíveis.
- Não executar exclusões em Supabase, Storage, tabelas ou migrações como parte da limpeza de UI.
- Preservar os assets versionados em react/ controlados pelo workflow de publicação; esses bundles garantem compatibilidade para abas que ficaram abertas.
- Os arquivos HTML de redirecionamento devem permanecer enquanto houver links públicos antigos e callbacks de confirmação que os utilizem.

## Verificações e rastreabilidade
- Comandos locais: npm run build, npm run lint, npm test, node --test tests/*.test.mjs.
- Browser: browser-accessibility.mjs, browser-compat-redirects.mjs e as suítes de fluxos do frontend.
- GitHub Actions: QA Hub React foundation, QA Hub React browser smoke e QA Hub visual accessibility route audit.
- Resultado consolidado e eventuais limitações adicionais devem ser conferidos no PR de descontinuação das telas legadas.
