---
name: web-quality-audit
description: Auditar a qualidade do BlockDOM com evidências de runtime e código: desempenho do editor, Core Web Vitals, acessibilidade, práticas de segurança, compatibilidade, rede e testes.
---

# Web Quality Audit — BlockDOM

**Origem:** https://github.com/addyosmani/web-quality-skills/tree/main/skills/web-quality-audit (MIT). Diretrizes adaptadas, sem instalar Lighthouse ou outros programas automaticamente.

## Ativação

**Sempre utilizar** antes de concluir PR, release, grande alteração do editor, correção de regressão visual, atualização de dependências ou passagem de fase do Spec Kit.

## Ordem da auditoria

1. **Selecionar rotas e estados:** editor inicial, HTML/CSS alterados, prévia executada, erros, projeto importado, viewport compacto.
2. **Coletar evidências do navegador:** erros de console, requests da rede, screenshot/estrutura, performance e testes Playwright.
3. **Inspecionar fontes focadas:** componentes afetados, CSS, configuração Vite, recursos do Blockly, validação HTML/CSS, CSP/sandbox.
4. **Acessibilidade:** executar a skill `accessibility`; automatização não substitui teclado/leitor de tela.
5. **Performance:** medir baseline reproduzível com fixture de 100 blocos; não afirmar lentidão/ganho baseado só em warning de bundle.
6. **Segurança:** executar `security-and-hardening`, principalmente importação JSON, conteúdo não confiável e preview; validar bloqueio de script, navegação, rede externa e acesso ao host.
7. **Regressão:** rodar unitários, integração e E2E pertinentes em navegadores-alvo.
8. **Relato:** evidências, arquivos/linhas, gravidade, estado, limitações, testes reexecutados.

## Regra de aceite

Não confundir Lighthouse, snapshots ou aparência com garantia de segurança/acessibilidade. Sinalizar testes não executados e não encerrar a POC com falha crítica em isolamento, integridade, teclado ou critérios P1.
