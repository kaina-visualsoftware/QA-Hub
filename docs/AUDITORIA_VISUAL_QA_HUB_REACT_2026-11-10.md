# Auditoria visual — QA Hub React
**Data:** 10/11/2026
**Escopo:** migração React, responsividade, estilos, acessibilidade e experiência de geração por IA.

## Metodologia
A revisão foi conduzida com base nas skills locais do repositório
`impeccable`, `web-quality-audit`, `frontend-design`, `accessibility` e
`playwright-e2e`. Incluiu inspeção do código, inspeção da captura de
tela do usuário e capturas reais produzidas pelo Chromium em CI.
A ferramenta de desktop remoto estava offline; portanto, a auditoria
não substitui homologação manual com contas reais, equipamentos móveis,
leitores de tela e a API NVIDIA em produção.

Verificações automáticas: axe-core WCAG A/AA, overflow horizontal do documento,
comportamento do foco e de modais, botões, rotas, estados de autenticação,
interações básicas e regressões com Supabase **simulado**.

## Páginas e estados abrangidos
| Área | Estado | Larguras |
| --- | --- | --- |
| Acesso | Login, cadastro e recuperação de senha | 320, 390, 1366 px |
| Biblioteca pública | Listagem, TF pública e visualização Mermaid ampliada | 320, 390, 1366 px |
| Tarefas | Listagem, TF aberta, navegação em abas, criação de TF e cenário, execução | 320, 390, 1366 px |
| Dashboard | Indicadores e distribuição das TFs | 320, 390, 1366 px |
| Ferramentas | Releases, comparações e informações importantes | 320, 390, 1366 px |
| Perfil | Dados da conta e preferências de menu | 320, 390, 1366 px |
| Administração | Acesso negado sem papel de administrador | 320, 390, 1366 px |
| Modais de IA | Gerar casos, posts e diagramas | 320, 390, 768, 1366 px |
| Streaming de IA | Conexão, resposta parcial, revisão, bloqueio de fechamento | 390 px |

**Limite de cobertura:** testes de navegador sintetizam dados de Supabase e respostas NVIDIA;
não certificam cada fluxo financeiro, autorização RLS entre duas contas reais nem todos
os estados possíveis de cada componente. O estado administrativo com permissão
efetiva e os fluxos completos de colaboração requerem homologação adicional.

## Problemas identificados e alterações
1. **Geração de casos:** durante a API, o modal mantinha formulário e área vazia.
   Foi convertido em fluxo `Configurar → Gerar → Revisar e adicionar`, com
   indicadores de fase reais, resposta em streaming, prévia limitada e cancelamento.
2. **Status/feedback:** o progresso antes mostrava só um contador de caracteres.
   Agora informa conexão, transmissão e preparação da revisão; não inventa uma
   porcentagem sem métricas reais do serviço.
3. **Segurança da edição:** previne fechamento da janela durante requisição ativa;
   resultados editados e configuração podem ser revisados sem gravação automática;
   há confirmação de conclusão e proteção contra segundo salvamento acidental.
4. **Layout responsivo:** modais ajustados com superfícies delimitadas, cartões
   de leitura, etapas compactas no mobile, quebra de palavras, rolagem vertical
   e `prefers-reduced-motion`.
5. **Acessibilidade da TF:** inconsistência `label-content-name-mismatch` no
   contador visível da aba de cenários. O botão passou a usar o nome derivado
   do conteúdo visível, incluindo a contagem.
6. **Testes de Mermaid:** corrigidas expectativas obsoletas no teste de reparo
   para usar a interface atual e esperar efetivamente a segunda requisição de
   gravação, sem confiar em uma mensagem antiga.

## Verificação e evidências
- Workflow `QA Hub React foundation`: types, lint, unitários e build.
- Workflow `QA Hub checks`: contratos legados e regras de QA.
- Workflow `QA Hub post and diagram modal smoke`: responsividade, geração
  simulada, streaming, reparo Mermaid e restrições de gravação.
- Workflow `QA Hub visual accessibility route audit`: acessibilidade e
  overflow nas rotas principais, com capturas em `qa-hub-all-pages-visual-audit`.
- Workflow `QA Hub React browser smoke`: regressões integradas das
  funcionalidades migradas.
- Capturas dos modais: artefato `qa-creator-modal-screenshots` no Actions.

A execução e seu resultado por commit devem ser conferidos no PR #69:
https://github.com/kaina-visualsoftware/QA-Hub/pull/69

## Riscos e próximos itens de homologação
- Fluxos reais da NVIDIA e o tempo de resposta sob diferentes conexões.
- Verificação do teclado virtual, touch/scroll e leitura de tela em celulares físicos.
- Permissões administrativas reais, RLS entre contas e acessos a anexos/storage.
- A navegação horizontal no cabeçalho móvel é intencional, porém tem pouco
  indicativo visual de rolagem; recomendada uma futura revisão de descoberta.
- A folha CSS central ainda reúne camadas históricas; consolidação por
  componentes requer uma refatoração específica e testes visuais regressivos.
