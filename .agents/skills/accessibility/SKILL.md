---
name: accessibility
description: Auditar e implementar WCAG 2.2 AA no BlockDOM, com foco em teclado, alternativa ao arraste, foco, leitura de tela, contraste, feedback, Blockly e execução de exercícios.
---

# Accessibility — BlockDOM

**Origem:** https://github.com/addyosmani/web-quality-skills/tree/main/skills/accessibility (MIT); orientação adaptada. Consultar a fonte e critérios WCAG 2.2 atualizados quando for necessária auditoria integral.

## Ativação

**Sempre usar** em alterações visuais, editor por blocos, inputs, componentes interativos, navegação, mensagens, novos exercícios, responsividade e antes da aprovação de uma fase.

## Roteiro de acessibilidade

- **Perceptível:** textos e placeholders legíveis, ícones com nome acessível, contraste verificado (4,5:1 texto normal; 3:1 texto grande quando aplicável); não depender só de cores.
- **Operável:** todo fluxo essencial deve ter alternativa por teclado. O arraste de blocos Blockly precisa de forma alternativa de inserir, mover para dentro/fora, reordenar, editar e remover. **Somente um botão de adicionar não basta.**
- **Compreensível:** erros com mensagem curta, referência ao bloco/regra e como corrigir; diferenciar erro real de dica.
- **Robusto:** nomes/roles/states e ordem de foco coerentes; `aria-live` sem repetição excessiva; blocos customizados verificados com leitor de tela.
- **Responsivo:** viewport compacta e zoom sem controles cortados; abas HTML/CSS/Prévia alcançáveis.
- **Movimento:** respeitar `prefers-reduced-motion` tanto em CSS quanto em JavaScript quando aplicável.

## Evidências e critérios

1. Auditar com axe/Lighthouse disponíveis e registrar falhas por elemento.
2. Executar **manualmente** roteiro Tab, Shift+Tab, Enter, setas e escape; verificar foco após operações.
3. Testar com leitor de tela pelo menos um cenário que cria HTML, aplica CSS, executa e recebe alerta.
4. Conferir 390×844, 768×1024 e 1366×768, inclusive zoom.
5. Corrigir e repetir. **Um score automatizado alto não comprova conformidade WCAG**.

Privacidade e proteção dos estudantes continuam obrigatórias. Não relaxar isolamento do iframe para solucionar foco/navegação.
