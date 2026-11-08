# QA Hub — consolidação das funções da versão antiga na SPA React

A navegação nova preserva Tarefas como entrada principal. A barra lateral não possui menus separados para posts, diagramas ou roteiros: estas operações fazem parte de uma TF. O perfil permite ocultar Visão geral, Ferramentas, Públicas e Administração (quando autorizado). A configuração é mantida em user_metadata.qa_navigation_v1 do usuário autenticado, sem alterar acessos nem políticas.

## Equivalência de funções

| Legado | React | Notas |
| --- | --- | --- |
| Visão geral e indicadores | /painel | Totais por status, indicadores e tarefas recentes; cobertura consulta até 30 TFs recentes e usa apenas execuções gravadas |
| Tarefas, cenários, resultados, falhas | / e /tarefa/:taskId | Cadastro rápido, filtros, execução e histórico por TF |
| Posts do fórum / casos por IA | Tarefas > TF > Gerar post / Gerar casos | Consentimento por operação, revisão e confirmação de salvamento |
| Diagramas Mermaid | Tarefas > TF > Diagrama | IA, edição, prévia e validação antes de salvar |
| Importar relatório / análise de texto | Tarefas > Nova TF > Importar relatório ou IA online | TXT/MD/PDF/DOCX lidos localmente; serviço qa-ai usado apenas com consentimento |
| Lista e comunicado de release | /ferramentas > Releases | Processamento local, sem criar vínculo automático com TF |
| Comparação de textos / XML | /ferramentas > Comparar textos / Comparar XML | Conteúdos não são enviados nem persistidos; contagens podem ser vinculadas dentro da TF |
| Informações importantes | /ferramentas > Informações | Referências privadas de checklist, nota e regra reutilizam qa_referencias |
| Releases, referências e comparações vinculadas | Tarefas > TF > Mais ferramentas > Releases e referências | Operações vinculadas com autorização do proprietário |
| Biblioteca pública e administração | /publicas, /admin | Preferência de menu nunca substitui verificações de autorização |
| Perfil / personalização | /perfil | Configuração salva na conta por Supabase Auth; Tarefas e Perfil são acessos fixos |

## Limites e segurança

- Não há cópia automática de senhas, logins e códigos sigilosos guardados em geradores.html. A antiga biblioteca podia conter credenciais em armazenamento local; a React não copia esse conteúdo para qa_referencias. Para credenciais, use um gerenciador de senhas; Informações é para notas e checklists.
- Não há OCR de PDFs digitalizados. Sem texto selecionável, informe a descrição manualmente.
- A IA online extrai uma prévia, nunca aprova cenários ou grava TFs automaticamente; a pessoa revisa e seleciona os casos a anexar.
- Os testes de navegador usam dados sintéticos. QA manual no celular e RLS com contas reais continuam como verificações separadas.
- Nenhuma migração SQL foi necessária.

## Validação

- frontend: npm run typecheck, npm run lint, npm test, npm run build.
- frontend: QA_TEST_PUBLICATION_ENABLED=true node tests/browser-suites.mjs com build VITE_PUBLIC_SHARING_ENABLED=true, como no workflow do PR.
- browser-profile-utilities.mjs: preferência persistida, ferramentas, referências, importação, IA com consentimento; 320/390/768/1366 px; auditoria automática de acessibilidade.
- browser-accessibility.mjs: WCAG automatizada, foco e reflow. Acessibilidade humana permanece pendente.
