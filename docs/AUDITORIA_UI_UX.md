# Auditoria de interface e UX — QA Hub
Data: 2026-11-05

## Escopo e diretrizes

Páginas e código revisados: `index.html`, `qa.html`, `qa.css`, `qa.js`.
Referências locais usadas: `web-quality-audit`, `frontend-design`, `ui-ux-pro-max`, `web-design-guidelines`, `accessibility`, `frontend-ui-engineering`, `playwright-e2e` e `impeccable` (reference/craft-floor.md). O launcher binário Impeccable não estava disponível neste ambiente; o checklist local foi lido diretamente. As orientações de BlockDOM foram adaptadas ao produto de QA, sem introduzir funcionalidades do editor Blockly.

**Direção:** sistema operacional de QA, focado na busca, leitura e edição de TFs; manter a identidade azul-petróleo/verde, reduzir atrito e evitar ornamentação. Os dados exibidos dependem de autenticação Supabase.

## Achados no código e correções

| Prioridade | Arquivo / componente | Achado comprovado por inspeção | Ajuste |
| --- | --- | --- | --- |
| Alta | `qa.css` / textos secundários | Paleta com exemplos de contraste sobre branco abaixo de 4,5:1, como `#96a1a9` (2,64:1), `#9ba9b0` (2,41:1), `#73808e` (4,03:1). | Escurecimento de tons, maior legibilidade, contraste testado em metadados de lista. |
| Alta | `qa.js` / menu móvel | Botão apenas alternava `open`; sem overlay, Escape, bloqueio de rolagem ou controle de foco. | Backdrop, `aria-controls/expanded`, `inert` quando fechado, Escape com retorno do foco, responsividade. |
| Alta | `qa.js` / editor | Não havia alerta de dados em formulários não salvos antes da navegação. | Identificação de formulários modificados, aviso em tela, confirmação para descartar, proteção no fechamento da aba e logout. |
| Média | `qa.html` / abas | `role=tab` e `aria-selected` sem `aria-controls`, relacionamento com painéis ou navegação de teclado pelas setas. | IDs e semântica `tabpanel`, foco roving, setas, Home e End. |
| Média | `qa.js` / lista vazia | Mesmo texto quando não há TFs e quando filtros descartam todas. | Estados vazios distintos e botão `Limpar filtros`. |
| Média | `qa.css` / tarefas longas | Título truncado em linha única, ocultando informação útil. | Até duas linhas legíveis e quebra de metadados extensos. |
| Média | `qa.css` / controles compactos | Alvos menores que 44 px e risco de apertos no cabeçalho e abas. | Alvos de toque, wrap no cabeçalho estreito, scroll horizontal das abas, form actions flexíveis. |
| Baixa | `qa.html` / navegação | Ausência de atalho para o conteúdo principal. | Skip link visível ao receber foco e landmark identificado. |
| Baixa | `qa.js` / notificações | Alertas de erro usavam `role=status`, de mesma prioridade que sucesso. | Erros usam `role=alert`; sucesso mantém `status`. |

## Evidências da implementação

- Inspeção estática do código original e revisão do diff da branch.
- Verificação sintática de módulos JS e testes unitários do parser: workflow `QA Hub checks`.
- `tests/ui-smoke.mjs` via Playwright Chromium com mocks de dados **sintéticos** (sem usar contas ou TFs reais). Executa navegação `index.html → qa.html`, login simulado, dashboard, overflow nas larguras 320 / 390 / 768 / 1366 px, menu móvel + Escape + backdrop, teclado nas abas, confirmação de descarte, salvar TF, filtros e contraste de metadados. Capturas de tela disponíveis no artefato `qa-ui-captures` do GitHub Actions.
- Os resultados do workflow devem ser conferidos no PR; a presença do teste **não comprova** que ele passou.

## Pendências importantes

1. Navegadores Firefox e WebKit, zoom a 200%/400%, leitor de tela (NVDA/VoiceOver) e navegação manual por teclado.
2. Validação end-to-end com **Supabase real**: autenticação, CRUD, RLS entre usuários, timeout, erros de rede e sessão expirada.
3. Evolução: salvamento automático de rascunhos com recuperação, histórico de alterações por TF, paginação server-side, importação com preview/validação individual, foco após modais e mensagens de erro por campo.
4. Métricas Lighthouse/Core Web Vitals reais no domínio publicado. Não foram medidas apenas por inspeção de CSS.
5. O comportamento dos formulários de edição de cenário/diagrama precisa de homologação humana, especialmente textos extensos.

**Critério de aceite:** CI estática e browser smoke aprovados, interface sem overflow nos tamanhos testados; homologação humana permanece separada.

## Inspeção visual das capturas em Chromium

Foram abertas e inspecionadas capturas reais geradas pelo fluxo de teste sintético (sem dados de usuários) em 320, 390, 768 e 1366 px. Em 390, 768 e 1366 px, a lista de TFs, filtros, hierarquia e navegação permaneceram legíveis, sem cortes ou sobreposições observados. Em 320 px foi identificado um aperto entre o título longo e o badge de situação; aplicou-se layout vertical específico para até 360 px. Essa alteração final requer repetição do browser smoke e nova inspeção da captura.

As capturas comprovam apenas o estado exercitado pela suíte: lista com uma TF após salvar. Não equivalem à avaliação visual de dashboard com dados densos, formulário completo, modal de importação ou do site autenticado em produção.
