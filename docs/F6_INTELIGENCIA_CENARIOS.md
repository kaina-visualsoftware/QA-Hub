# QA Hub — F6: inteligência de QA e biblioteca privada de cenários

## Objetivo

A F6 transforma os dados dos testes em informações utilizáveis sem aumentar o número de etapas para cadastrar, executar ou finalizar uma TF. Complementa as fases F0–F5 com duas funções opcionais:

1. Indicadores de qualidade por módulo e versão, consultados quando o usuário solicitar.
2. Reutilização de cenários por meio de uma biblioteca privada.

## Inteligência de QA

Acesse **Visão geral → Análises de qualidade → Explorar indicadores**.

A consulta `public.qa_insights_v1(p_months)` responde apenas aos dados permitidos pelas políticas RLS já existentes. É `SECURITY INVOKER`, não possui acesso de serviço e não pode ser invocada por `anon`. O parâmetro de período fica restrito a 3–12 meses.

Os indicadores mostram:

- **Cobertura por módulo:** total de cenários, executados e casos reprovados/bloqueados, agrupados pelo campo atual `sistema` da TF.
- **Versões das TFs:** agrupamento por módulo e versão *atual* da TF; contagem de TFs aprovadas, cenários executados e casos com problema.
- **Histórico confirmado:** mudanças de status capturadas em `qa_execucao_historico` desde a F4, com destaque para transições `aprovado → reprovado/bloqueado`.

**Distinções obrigatórias:** cenários pendentes não são considerados aprovados ou executados; registros `origem=base` nunca são tratados como execução; uma mudança de status não equivale necessariamente a uma nova rodada independente de testes. Se a versão da TF for editada depois do evento, a análise não inventa a versão histórica. O relatório apresenta eventos por mês e contagem de problemas atuais, não atribuição especulativa de bugs.

O painel é carregado sob demanda, dentro de um modal, para evitar novas consultas no carregamento normal do dashboard. Há estados de carregamento, vazio e erro, além do controle de período.

## Biblioteca de cenários reutilizáveis

Acesse **TF → Testes → Biblioteca** (proprietário da TF).

- **Salvar cenário:** selecione um caso da TF, confira o aviso de privacidade e confirme. A biblioteca grava somente `titulo`, `passos`, `esperado`, `observacoes`, módulo e tipo de teste.
- **Usar modelo:** pesquise por título/módulo/passos, consulte a prévia e clique em **Adicionar à TF**, confirmando explicitamente.
- **Excluir modelo:** remove apenas o modelo guardado, nunca o cenário original ou cópias já adicionadas.

Novos cenários são inseridos na TF como **`nao_executado`**, com resultado observado vazio. A cópia não preserva resultado antigo, anexos, logs, status geral da TF ou referências privadas. Não é possível compartilhar modelos com outra conta nesta versão.

O cliente só mostra ao proprietário a biblioteca e confere propriedade nos comandos; **a autorização real fica nas políticas RLS do Supabase**, com `user_id=auth.uid()` para SELECT/INSERT/DELETE. UPDATE não é concedido. O frontend mostra os cem modelos privados mais recentes sem carregar modelos de outras contas.

Os modelos contêm passos e notas, portanto podem incluir informação operacional. O usuário confirma antes de salvar, deve revisar dados sensíveis e evitar registrar informações de cliente desnecessárias.

## Banco e implantação

Migração aditiva: `supabase/qa_f6_insights_templates.sql`.

- Tabela `public.qa_modelos_cenario` com RLS e índice por usuário/data.
- RPC `public.qa_insights_v1(integer)` com `SECURITY INVOKER`, `search_path=''` e acesso `authenticated`; sem `service_role` no frontend.
- Não modifica TFs, cenários antigos, resultados, PDFs, evidências ou permissões anteriores.
- Aplica-se antes de publicar o código do frontend, para que o modal possa consultar os novos recursos.

## Testes e homologação

- Testes unitários verificam a porcentagem de cobertura, contratos Zod e cópia que descarta informações de execução.
- Teste de navegador sintético percorre salvar modelo, importar pendente, excluir sem apagar cenários existentes, abrir indicadores sob demanda e trocar período, em 320, 390, 768 e 1366 px.
- A suíte completa inclui F0–F5, acessibilidade, autenticação, QA guiado, arquivos, relatórios e trava de publicação.

**Homologação humana pendente:** comparar permissões de duas contas reais, conferir acessibilidade assistiva (TalkBack/NVDA), testar em celular físico e verificar os agrupamentos com dados de produção reais. Não há reconstrução retroativa de versões e execuções anteriores à F4.
