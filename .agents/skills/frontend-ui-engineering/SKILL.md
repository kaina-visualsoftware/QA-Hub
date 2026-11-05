---
name: frontend-ui-engineering
description: Arquitetura, implementação, refatoração e verificação de componentes React/TypeScript, estados de interface, responsividade, acessibilidade e integração Blockly no BlockDOM.
---

# Frontend UI Engineering — Integração BlockDOM

**Origem:** https://github.com/addyosmani/agent-skills/tree/main/skills/frontend-ui-engineering  
**Licença upstream:** MIT. **Esta é uma orientação própria adaptada ao BlockDOM, não a cópia integral do repositório.**

## Responsabilidade

Transformar decisões de UI/UX em **componentes reais, testáveis e manuteníveis**. Priorizar React/TypeScript estrito, composição de componentes, limites claros de estado e testes observáveis. Evitar mudanças visuais que quebrem o encaixe, o undo/redo, a geração HTML/CSS ou o sandbox.

## Quando usar

- Criar componentes, hooks, estados, navegação e layouts responsivos.
- Corrigir bugs de renderização, focus, scroll, clipping, menus e toolbar.
- Separar áreas monolíticas e componentes com múltiplas responsabilidades.
- Integrar workspaces Blockly com ciclo de vida React e ações acessíveis.
- Preparar UI para entrega, com critérios de qualidade e evidência.

## Arquitetura recomendada para o laboratório

Separar estas responsabilidades, sem reescrever componentes funcionais sem motivo:

```text
src/
  app/                        # composição de rotas, providers e layout
  features/editor/
    components/               # toolbar, HTML workspace, CSS workspace, feedback
    hooks/                    # ciclo de vida de workspaces/eventos
    blockly/                  # blocos, toolbox e adaptação
    editor-controller.ts      # execução e snapshot de visualização
  features/preview/           # iframe restrito e documento seguro
  domain/                     # HTML/CSS, validação e geradores puros
  shared/ui/                  # controles reutilizáveis sem regras de Blockly
```

**Contrato:** componente renderiza estado e coleta interação; domínio decide validade do HTML/CSS. Evite importar React ou Blockly no `domain/`. Não coloque todos os eventos e operações no `App.tsx`.

## Estado e efeitos

- Começar por `useState` local; elevar quando várias partes precisarem do mesmo estado; Zustand só quando a complexidade justificar.
- Guardar instâncias mutáveis Blockly em `useRef` e liberar listeners, timers e `workspace.dispose()` no cleanup.
- Garantir comportamento correto com `React.StrictMode` e montagens duplicadas de desenvolvimento.
- Evitar cópias completas da árvore Blockly no estado React a cada movimento.
- Manter separadas **edição atual** e **última execução bem-sucedida**; preview só atualiza com **Executar**.
- Não confiar na tipagem TS para JSON importado; validar conteúdo externo em runtime.

## Composição e CSS

- Preferir componentes pequenos e orientados a uma ação; extrair lógica antes de criar um único arquivo com centenas de linhas.
- Criar tokens semânticos e componentes acessíveis reutilizáveis; restringir estilos globais para não afetar SVG e menus internos do Blockly.
- Usar elementos nativos `button`, `input`, `label`, `dialog` quando adequados, com nome acessível e foco visível.
- Usar layout em grid/flex adaptativo e limitar overflow sem esconder controles.
- Componentes de carga, vazio, erro e sucesso devem explicar o estado e próximo passo.
- Aplicar cores e tipografia da direção de design, não defaults genéricos.

## Verificação por entrega

1. `npm run typecheck`, `npm run test` e `npm run build` sem regressão.
2. Playwright cobre o cenário alterado, incluindo viewport compacto e desktop.
3. Teste de teclado, foco, labels e interação dos blocos customizados.
4. Teste da prévia permanece isolada, sem acesso à origem da aplicação.
5. Verificar console do browser e requests externos não autorizados.
6. Registrar versões, arquivos mudados, resultados e falhas reais no PR.

Se não houver ambiente de teste, deixar o estado como **não verificado**, sem presumir sucesso.

## Interação com outras skills

- `ui-ux-pro-max` e `frontend-design`: definir direção antes de codificar.
- `ui-animation`: tratamento de movimento depois que a ação funciona.
- `web-design-guidelines`: auditoria de acabamento e acessibilidade.
- Constitution/Spec Kit: escopo, prioridades e Definition of Done.

Não adicionar bibliotecas de estado ou animação por preferência pessoal; justificar impacto no bundle e nas tarefas.
