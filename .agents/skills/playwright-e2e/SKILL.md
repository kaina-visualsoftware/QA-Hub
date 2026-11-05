---
name: playwright-e2e
description: Planejar, escrever, executar e depurar testes E2E em navegadores reais para o BlockDOM, incluindo workspaces Blockly, segurança da prévia, responsividade, teclado e persistência dos projetos.
---

# Playwright E2E — BlockDOM

**Referência:** https://github.com/microsoft/playwright-cli/tree/main/skills/playwright-cli (skill oficial de automação, com comandos CLI próprios). Esta orientação utiliza o **Playwright Test já configurado no projeto**, não implica instalar playwright-cli.

## Ativação

**Sempre em** implementação de fluxos do editor, bugs de runtime, alterações visuais, segurança do iframe, responsividade, serialização e aceitação de fase.

## Contrato de teste

- Escrever cenários com `@playwright/test` em `tests/e2e/`, com fixtures determinísticas; não depender de servidor externo.
- Testar em `chromium`, `firefox` e `webkit` nos ambientes suportados. Reportar claramente quando um browser não estiver instalado.
- Localizar elementos por role/nome acessível e estado; evitar seletores frágeis de classes e coordenadas.
- Exercitar workspace, toolbox e blocos reais; não simular sucesso apenas modificando o DOM.
- Verificar que a prévia só muda após `Executar`; testar falha preservando último snapshot.
- Inspecionar `iframe[sandbox]` e sua origem, tráfego de rede e rejeição de payloads, sem elevar permissões.
- Verificar ações sem mouse, foco e mensagens educativas.
- Para responsividade, usar 390×844, 768×1024, 1366×768 e documentar overflow/corte.
- Para desempenho, registrar ambiente, hardware e medições reproduzíveis (SC-008).

## Execução prevista

```bash
npm run typecheck
npm run test
npm run build
npx playwright test
```

Executar no checkout que contém o código atualizado, registrando versões, resultados, screenshots e falhas relevantes. Não afirmar testes passados por serem apenas escritos. Evitar instalar uma ferramenta nova caso Playwright Test existente resolva a tarefa.

**Limite:** scripts E2E não substituem testes unitários, auditoria de segurança ou verificação humana de leitor de tela.
