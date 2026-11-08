# QA Hub — F1: execução guiada de cenários

## Objetivo

Reduzir a rolagem e o número de formulários durante a execução de uma TF. A F1 adiciona um modo de trabalho focado em um cenário de cada vez, preservando a lista tradicional.

## Fluxo

1. Na TF, clicar em Testar ou escolher Guiado na área Testes. O link Continuar testes da listagem também abre o modo guiado.
2. Ler passos, resultado esperado, status e observações. O progresso usa somente dados confirmados no servidor.
3. Funcionou salva a aprovação. Não funcionou e Bloqueado solicitam uma observação na própria tela, com no mínimo três caracteres.
4. Só depois da confirmação do servidor a interface avança ao próximo pendente. Em caso de falha da API, o caso permanece selecionado, com opção de tentar novamente.
5. Anterior e Próximo navegam sem gravar. Pendentes é o filtro inicial. Todos permite revisar casos anteriores, incluindo correção e desfazer com confirmação quando observações seriam substituídas.
6. Adicionar evidência abre o painel atual com o cenário pré-selecionado. Links e notas são suportados; upload real é escopo F3.
7. Quando não restam pendências, o usuário vê uma indicação de conclusão, mas a situação da TF não é alterada automaticamente.

## Interface e segurança

- No celular, o cabeçalho de TF é compacto e ações de criação são recolhidas durante o modo guiado. O modo Lista mantém edição, filtros e consulta conjunta.
- Usuários não proprietários veem os testes, mas não podem registrar ou alterar resultados. O banco também valida as permissões existentes.
- Nada é salvo automaticamente, e resultados só avançam após confirmação do servidor.
- Converter falha em aprovação ou apagar observações existentes exige confirmação. A descrição antiga não é reaproveitada como resultado de aprovação.
- Não há novas tabelas, migrações, mudanças de IA ou alteração das regras de publicação.
- Observações não salvas durante a execução não persistem entre sessões do navegador.

## Validação

- Testes unitários de ordenação, próximos casos pendentes e fim da fila.
- E2E sintético de 320/390/768/1366 px, axe-core WCAG, rede indisponível, retentativa, observação, conclusão, revisão, confirmação, evidências pré-selecionadas e alternância com Lista.
- Regressão de autenticação, IA, casos, relatórios, compartilhamento e fluxos de tarefas.
- Homologação com celulares físicos, tecnologias assistivas e contas reais de teste permanece pendente.
