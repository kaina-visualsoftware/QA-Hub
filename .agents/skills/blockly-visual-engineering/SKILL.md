---
name: blockly-visual-engineering
description: Skill específica do BlockDOM para criar e revisar blocos HTML/CSS com Blockly, conexões tipadas, modelo intermediário, geradores, persistência, validação, acessibilidade e segurança da prévia.
---

# Blockly Visual Engineering — BlockDOM

**Origem:** skill original do projeto baseada em `specs/001-editor-visual-poc/` e documentação oficial Blockly (https://developers.google.com/blockly). Não é uma skill externa de terceiros.

## Ativação

**Sempre ler** quando criar/corrigir blocos, toolbox, conexão, workspace, adaptadores, serialização, import/export, geradores HTML/CSS, validadores e associação de estilos.

## Contratos que não podem ser quebrados

- Blockly representa a **edição visual**, não é única fonte de verdade para execução e avaliação.
- Manter `DocumentModel` versionado e independente de React/Blockly; HTML e CSS são derivados desse modelo.
- Usar `page_root` e `stylesheet_root` como raízes lógicas para preservar ordem; blocos desconectados ficam no workspace, não aparecem indevidamente no HTML/CSS publicado.
- Tags HTML vazias como `img` não aceitam filhos; validar fraseamento/fluxo por regras do domínio, sem proibir HTML válido por preferência didática.
- A associação CSS–HTML é por seletor (tag/classe/ID, podendo alcançar múltiplos nós), **não** por conexão física entre workspaces.
- Persistir Blockly JSON e projeção de domínio versionada; importar exige validação robusta e reversão em falha.
- Preview atualiza apenas com o botão **Executar** e mantém último snapshot válido em falha.
- `iframe sandbox=""`, CSP restritiva, nenhum JavaScript de estudante, navegação privilegiada ou recurso remoto não autorizado.
- Alternativa **completa** de interação por teclado precisa cobrir adicionar, selecionar, mover, aninhar, editar e remover blocos essenciais.

## Testes que acompanham toda mudança

- Unitários de regras do domínio, parsing e geração de HTML/CSS.
- Integração de workspace Blockly, conexões e round-trip JSON, incluindo elementos desconectados.
- E2E Playwright: arrastar/encaixar, CSS em vários elementos, executar e feedback educativo.
- Testes hostis de HTML/CSS/URLs/JSON, origem opaca do iframe, navegação e rede.
- Testes de teclado/foco e fixture de 100 blocos para desempenho.
- Validar StrictMode, init/dispose/listeners de Blockly e carregamento de assets locais.

## Documentação vinculada

- Constitution: `.specify/memory/constitution.md`.
- Specify: `specs/001-editor-visual-poc/spec.md`.
- Plan: `specs/001-editor-visual-poc/plan.md`.
- Contracts: `specs/001-editor-visual-poc/contracts/engine-contracts.md`.
- Tasks: `specs/001-editor-visual-poc/tasks.md`.

Não declarar o motor pronto baseado apenas em 10 testes unitários ou em 6 E2E de cenário básico. O gate completo da Fase 0 continua necessário.
