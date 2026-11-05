---
name: test-driven-development
description: Praticar testes orientados a comportamento (red-green-refactor) em novas funcionalidades, correções e refatorações do BlockDOM, com critérios rastreáveis e evidências verificáveis.
---

# Test-Driven Development — BlockDOM

**Referência:** https://github.com/obra/superpowers/tree/main/skills/test-driven-development (MIT). Adaptação para desenvolvimento incremental e código existente; o texto original completo não foi copiado.

## Ativação

**Sempre que** implementar nova regra, corrigir bug, refatorar comportamento ou alterar geradores, validador, serialização, associações CSS, segurança e lógica de exercícios.

## Ciclo

1. Escolher 1 requisito/história e cenário observável da spec.
2. Escrever teste que reproduz o comportamento desejado; em correções, reproduzir a falha.
3. Executar teste e confirmar falha pela razão esperada (**RED**).
4. Fazer a menor mudança no código existente que satisfaça o teste (**GREEN**), preservando funcionalidades funcionando.
5. Rodar o teste, depois os testes relacionados; refatorar com a suíte verde (**REFACTOR**).
6. Registrar ambiente, comandos, resultados, limitações e ligação com o requisito.
7. Se não for possível executar, registrar como **não verificado**. Não inventar evidências.

**Princípio de preservação:** não apagar código existente apenas porque foi escrito antes de testes; criar testes de caracterização/regressão, depois corrigir incrementalmente.

## Padrões de teste por camada

- Modelo HTML/CSS: Vitest, casos válidos, inválidos, alternativos, duplicações, escapes, cascata, tipos e limites.
- Blockly: testes de integração de construção/conexão/desconexão, transferência de estado e round-trip.
- Interface: React Testing Library para estados e feedback.
- Browser: Playwright para editor real, viewport, teclado, rede, sandbox e performance.
- Segurança: incluir cenários adversos e testes de regressão específicos.

O fechamento de uma história exige os gates do Spec Kit, não só o teste unitário principal.
