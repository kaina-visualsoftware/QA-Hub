---
name: vercel-react-best-practices
description: Aplicar padrões de performance e composição React na implementação do BlockDOM, principalmente ciclo de vida do Blockly, renders, bundle Vite, eventos, estado, lazy loading e memoização fundamentada.
---

# React Best Practices — BlockDOM

**Referência original:** https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices (skill `vercel-react-best-practices`, MIT). Este resumo é adaptado ao BlockDOM; para regras detalhadas, consultar a fonte atual.

## Ativação

**Sempre ler quando** a tarefa editar componentes ou hooks React, trabalhar com desempenho de bundle, rerenders, listas extensas, estado compartilhado ou revisão de arquitetura frontend.

## Diagnóstico antes da otimização

- Identifique o comportamento real (por exemplo: editor reinicializa, trabalho lento com 100 blocos, render excessivo do painel de feedback, bundle JS elevado).
- Priorize corretude e testes antes de otimização. Registre medições/trace quando a melhoria reivindicar ganho de desempenho.
- Considere custo de carregar `blockly/core` no bundle inicial; loading sob demanda e divisão de chunks podem ser avaliados após diagnóstico, nunca por suposição.
- Evite re-renderizar workspaces inteiros por qualquer edição; use `useRef` para a instância e estado React apenas para indicadores derivados.
- Em `useEffect`, registrar e remover listeners e timers; testar montagem/desmontagem sob StrictMode.
- `useMemo` e `useCallback` não são obrigatórios em cada componente; aplicar somente quando a referência estável eliminar custo real.
- Preferir imports específicos para reduzir dependências carregadas; controlar duplicação de bibliotecas e componentes.
- Manter operações do domínio HTML/CSS fora de React e Blockly, permitindo teste unitário isolado.

## Entrega verificável

1. Typecheck + unit tests + build Vite.
2. Teste Playwright da jornada afetada, incluindo editor montado/desmontado.
3. Comparação de bundle, performance ou renders **somente se coletada**.
4. Avaliação de foco, acessibilidade, viewport e snapshot de prévia.
5. Relatório de melhorias, regressões e problemas conhecidos.

**Não aplicar regras de Next.js/server-side** a uma POC React + Vite client-side sem justificativa.
