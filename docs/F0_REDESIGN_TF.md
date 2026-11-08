# QA Hub — F0: tela de TF centrada na execução

Implementação de UX na SPA React, sem alteração de RLS, schema, dados ou consentimento de IA. O legado continua disponível como compatibilidade.

## Antes e depois

Antes, a tela mantinha permanentemente a lista completa de cenários e um conjunto de ferramentas no mesmo fluxo vertical.

A F0 organiza a TF em três áreas:

- **Resumo**: cabeçalho enxuto, andamento gravado, próximo passo, ações Cenário / Testar / Gerar casos / Diagrama, descrição curta com expansão opcional e acesso a Entregáveis em um clique.
- **Testes**: filtros Todos / Pendentes / Falha e bloqueio, edição e exclusão sob opções secundárias, resultados reais e criação/geração de casos.
- **Entregáveis**: ações Gerar post, Gerar diagrama e Relatório; acesso direto a requisitos, evidências, releases, documentos e diagramas salvos.

As configurações de estado e compartilhamento ficam junto a Editar TF, sem criar um quarto painel visível. A situação da TF não muda automaticamente após a execução de um cenário.

## Fluxos preservados

1. Testar seleciona a área Testes e o filtro Pendentes. Se não houver pendentes, informar sem alterar dados.
2. Continuar testes na lista consome a intenção de navegação; atualizar não executa nem reinicia automaticamente.
3. O editor preserva Salvar e criar outro, validação e confirmação antes de descartar dados.
4. IA de casos, posts e diagramas conserva consentimento explícito, prévia e gravação confirmada.
5. Relatórios e prévias editadas continuam montados ao fechar modais, preservando alterações manuais.
6. Permissões, filtros, falha/bloqueio, exclusão e publicação não foram modificados.

## Qualidade e acessibilidade

- Tabs semânticas com aria-selected/aria-controls e teclas Setas, Home e End, com foco visível.
- Verificações em 320/390/768/1366 px e auditoria automatizada axe-core.
- Descrição técnica longa recolhida em controle nativo acessível.
- A F0 não altera os formulários internos de IA e requisitos, nem o motor de execução da F1.

## Homologação ainda necessária

- Teste real de tempo para localizar e realizar ações versus versão anterior.
- Homologação no celular físico e com tecnologias assistivas.
- Validação de RLS com usuários reais de teste em ambiente isolado.
