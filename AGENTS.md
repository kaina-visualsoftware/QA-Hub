# Instruções para agentes — QA Hub

Leia `README.md`, `docs/PLANO_EVOLUCAO_QA.md` e o código existente antes de alterar o projeto.

- A interface ativa é React em `frontend/src/`, publicada em `react/`. `qa.html` é o gateway de compatibilidade do Supabase Auth. Preserve os redirecionamentos e não reintroduza o hub legado.
- Para novas interfaces, aplicar `.agents/skills/frontend-design/SKILL.md`, `ui-ux-pro-max`, `accessibility` e `impeccable` em modo Operate. Interfaces densas devem priorizar leitura, busca e teclado.
- Para alterações de banco ou Auth, aplicar `security-and-hardening`, Postgres Best Practices e documentação atual do Supabase. Nunca remover RLS nem usar chaves privilegiadas no navegador.
- Para bugs, consultar `test-driven-development`, `code-review-and-quality` e `playwright-e2e`. Descrever claramente testes realmente executados, dependências e limitações.
- Para **toda tarefa de desenvolvimento**, consultar também os guias `.agents/skills/rtk/SKILL.md`, `context-mode`, `headroom` e `graphify`. Quando as CLIs/plugins correspondentes estiverem realmente instalados no agente, usar suas capacidades apropriadas de economia de tokens e navegação do repositório; verificar disponibilidade antes de cada uso. Não executar instalação global, hooks ou proxies não auditados como efeito colateral e não afirmar que uma integração está ativa apenas porque o arquivo SKILL.md existe.
- Skills copiadas do BlockDOM são **documentação de orientação**, não instalação global; exemplos específicos do Blockly não são requisitos para este produto.
- Não copiar scripts executáveis não revisados, dados internos ou credenciais.
- Preferir PRs pequenos e sem merge automático; exigir validação de segurança/qualidade antes de integrar na main.

Fluxo: diagnóstico → requisito/aceite → mudança isolada → testes → revisão de segurança → PR.

- Para inspeção visual, aplicar `.agents/skills/agent-desktop/SKILL.md`. Para consistência de telas e visibilidade herdada da TF, seguir `docs/PADRAO_INTERFACE.md`.
