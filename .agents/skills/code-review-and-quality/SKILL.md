---
name: code-review-and-quality
description: Executar revisão de código antes de integrar PRs no BlockDOM, verificando corretude, legibilidade, modularidade, segurança, performance, acessibilidade, rastreabilidade Spec Kit e resultados de testes.
---

# Code Review and Quality — BlockDOM

**Origem:** https://github.com/addyosmani/agent-skills/tree/main/skills/code-review-and-quality (diretrizes próprias adaptadas ao projeto).

## Ativação

**Sempre antes de merge**, após correção relevante, refatoração e fim de um incremento do Spec Kit. Para alteração documental simples, fazer revisão de links, formatos, origem e consistência, sem simular build.

## Cinco eixos de revisão

1. **Corretude:** atende FR/SC e não quebra hierarquia, CSS, serialização ou execução? Tratamento real de erro e estados de falha?
2. **Legibilidade:** tipos, nomes, coesão, funções testáveis e mensagens educativas? Ausência de arquivos monolíticos sem necessidade?
3. **Arquitetura:** domínio permanece independente de React/Blockly? Conexões CSS 1:N e snapshot de prévia respeitados?
4. **Segurança e privacidade:** validador de entrada, sandbox, CSP, acesso ao host, requisições externas e dados de adolescentes?
5. **Performance e UX:** inicialização do Blockly, bundle, 100 blocos, teclado/foco, responsividade e feedback?

## Como revisar

- Ler diff e contexto dos arquivos alterados antes de julgar.
- Identificar problemas por gravidade, reproduzir quando possível e citar `arquivo:linha`.
- Diferenciar bugs comprovados, riscos plausíveis e preferências estéticas.
- Reexecutar testes pertinentes após correções; indicar ambiente e limitações.
- Abrir pendências bloqueantes quando violar Constitution/Spec.
- Não exigir perfeição abstrata, mas não aprovar funcionalidade sem os gates de aceitação.

**Modelo de entrega:** achados prioritários → mudanças necessárias → testes realizados → riscos residuais → **Aprovar/Bloquear** com justificativa.
