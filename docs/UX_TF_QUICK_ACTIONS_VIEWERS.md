# QA Hub — Área de TF: visualização separada dos cadastros

## Problema
A área Resumo continha um painel grande com ações CRUD misturadas ao conteúdo de leitura. Para visualizar um diagrama salvo, o usuário precisava abrir o mesmo modal usado para gerar ou editar diagramas. A lista de posts e relatórios também ficava no gerador de relatórios.

## Novo fluxo
- **Resumo:** situação dos testes e descrição/análise da TF, sem blocos de geradores.
- **Ações rápidas:** botão flutuante no canto inferior direito em todos os três painéis, com executar testes, criar cenário, gerar casos, post, novo diagrama, visualizar diagramas, relatórios, evidências e requisitos. O menu fecha ao escolher ação, pressionar Escape ou clicar fora. Ações de criação só aparecem para o proprietário; executar depende de autorização.
- **Testes:** continuar execução guiada ou em lista e gerenciar cenários, sem misturar visualização de entregáveis.
- **Entregáveis:** listas de **diagramas** e **posts/relatórios já salvos**, com visualização diretamente na página (sem modal de cadastro). Diagramas podem ser selecionados, visualizados em iframe sandbox, editados em um modal separado ou excluídos por ação explícita e confirmação. Os documentos salvos podem ser lidos, copiados ou baixados como Markdown.
- **Criação/edição:** gerar post, criar/editar diagrama e criar relatório abrem os respectivos modais. O modal de relatório já não apresenta a lista de documentos salvos; o editor de diagrama não apresenta a lista de diagramas antigos. O preview do rascunho dentro do editor continua disponível antes de salvar.

## Integridade e segurança
- Navegar pelas listas/visualizar registros não realiza escrita no banco.
- Edição e exclusão continuam passando pelos serviços e permissões RLS existentes.
- O código Mermaid é validado antes da renderização e o SVG é renderizado em iframe `sandbox=""` (sem scripts no contexto principal).
- A central de IA ainda exige consentimento antes de enviar dados à NVIDIA.
- Queries dos artefatos só são ativadas quando a aba Entregáveis está visível, para preservar desempenho.
- Ao mudar de TF, o menu e os modais são desmontados/remontados com a identidade correta.

## Testes
- Novo cenário E2E com backend sintético, incluindo abrir menu, Escape, consultar diagramas sem edição, visualização de posts, modal de edição e modal de criação separados e verificação responsiva/WCAG em 320, 390, 768 e 1366 px.
- Adaptação das suítes anteriores do QA Hub às novas ações. Os fluxos de execução, IA, relatórios e criação de cenários permanecem preservados.
- Recomendados testes físicos em celular e com leitores de tela após publicação.

Não há migração de banco nesta entrega. O desenvolvimento segue independente da F7 (lixeira recuperável).
