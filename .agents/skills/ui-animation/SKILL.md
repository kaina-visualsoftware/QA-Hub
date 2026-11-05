---
name: ui-animation
description: Projetar, implementar e revisar transições, feedback de ação, mudanças de painel, estados do editor e microinterações acessíveis e eficientes no BlockDOM.
---

# UI Animation — Integração BlockDOM

**Fonte de referência:** https://github.com/mblode/agent-skills/tree/main/skills/ui-animation  
**Tipo:** adaptação de princípios gerais de motion para o contexto do editor; não copia os arquivos ou receitas do repositório externo.

## Uso

Consulte ao solicitar animação, transições, microinterações, fluidez, feedback de clique, animações de painel ou correção de movimento. Não use para substituir um problema funcional com efeito visual.

## Decisão antes de animar

Para cada interação, responda:

1. **O que muda?** Ex.: um bloco conectado, painel CSS aberto, validação concluída.
2. **Por quê mover?** Orientar, confirmar, preservar continuidade espacial ou explicar causa e efeito.
3. **Qual o meio mais simples?** Preferir CSS transitions; WAAPI ou biblioteca de motion somente com necessidade comprovada.
4. **Como respeitar acessibilidade e performance?** Foco não espera animação, redução de movimento e interrupção rápida devem ser possíveis.

**Não animar continuamente** ações de alta frequência como arrastar, inserir texto, selecionar bloco ou navegar entre toolboxes. Blockly já tem interações próprias; evitar overlays e transformações que prejudiquem conexões e hit testing.

## Padrões de projeto

| Ação | Recomendação |
| --- | --- |
| Botão **Executar** | feedback imediato de clique, estado de processamento se necessário, confirmação textual |
| Erro de bloco/conexão | mensagem localizada e foco no problema; evitar tremores e flashes repetitivos |
| Alternar HTML/CSS/Prévia | preservar posição e foco, transição curta apenas se não atrapalhar edição |
| Painel de ajuda | mostrar vínculo com o controle acionado, sem cobrir blocos críticos |
| Nova conquista futura | animação breve e opcional; não integrar à POC atual |
| Prévia atualizada | indicar atualização após clique; não simular execução automática |

## Regras de implementação

- Movimento de elementos normalmente por `transform` e `opacity`; não utilizar `transition: all`.
- Evitar animar `width`, `height`, `top` e `left` a cada quadro; considerar técnicas de layout apenas quando imprescindíveis.
- Botões e controles usados com frequência respondem sem atraso. Pequenas transições devem ser discretas, em geral inferiores a 300 ms.
- Animações devem poder ser interrompidas e retomar estado coerente, inclusive clique repetido.
- **Respeitar `@media (prefers-reduced-motion: reduce)`**; se usar motion JavaScript, tratar redução também na lógica, não apenas CSS.
- Navegação por teclado e leitores de tela não dependem de animação. Notificações também precisam de mensagem textual.
- Evitar som e movimento automáticos, especialmente numa ferramenta educacional para adolescentes.
- Não instalar Motion/GSAP ou outra biblioteca somente para um efeito simples.

## Testes mínimos

- Alternar rapidamente painéis, ativar/desativar opções e executar novamente.
- Medir se o movimento provoca deslocamento de layout, atraso de input ou perda de foco.
- Testar Chrome/Firefox/WebKit se mudanças dependerem de recursos específicos.
- Validar `prefers-reduced-motion`, touch e navegação só por teclado.
- Documentar o propósito da animação e os testes realizados, não apenas avaliação estética.

## Outras skills

`frontend-design` define identidade, `ui-ux-pro-max` discute experiência, `frontend-ui-engineering` implementa componentes, e `web-design-guidelines` audita. Esta skill cuida **apenas da lógica do movimento e feedback visual**.
