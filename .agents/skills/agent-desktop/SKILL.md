---
name: agent-desktop
description: Inspecionar e testar visualmente o QA-Hub no navegador do ambiente de desenvolvimento.
---

# Agent desktop — QA-Hub

Orientação local do projeto; não instala ferramentas nem representa uma skill externa.

- Leia AGENTS.md e README.md. Use o checkout existente.
- Para desktop compartilhado, use cloud-environment:cloud-desktop quando disponível; não presuma ferramentas ausentes.
- Para testes automatizados, use Playwright e Chromium disponíveis, com dados sintéticos e Supabase simulado pelos testes de frontend/tests.
- Valide listagens, criação/edição e prévias em 320, 390, 768 e 1366 px. Salve screenshots em frontend/artifacts, nunca dados pessoais.
- Localize controles por nomes acessíveis. Teste Tab, Shift+Tab, Escape, retorno do foco, rolagem e console.
- Modais usam QAModal; listagens permanecem na página. Teste prévias abertas dentro de outro modal.
- Teste TF pública, privada e retirada de publicação, incluindo download direto de anexos. Não aplique SQL em produção durante testes visuais.
- Relate apenas verificações realmente executadas e suas limitações.
