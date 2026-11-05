---
name: frontend-skill-discovery
description: Identificar e avaliar skills externas úteis para React, TypeScript, frontend, acessibilidade, UX, performance e testes, consultando o catálogo awesome-frontend-skills sem instalar automaticamente dependências.
---

# Frontend Skill Discovery — Catálogo curado

**Catálogo de referência:** https://github.com/finfin/awesome-frontend-skills

O repositório `finfin/awesome-frontend-skills` é uma **lista curada de links para skills de terceiros**, não um único `SKILL.md` para instalar. Esta skill local orienta a consulta e a seleção criteriosa de fontes relevantes ao BlockDOM. **Não contém nem reproduz o catálogo completo.**

## Descoberta oficial com Find Skills

A skill oficial foi adicionada em [`../find-skills/SKILL.md`](../find-skills/SKILL.md), com licença MIT em seu diretório. **Quando procurar uma skill nova, ler primeiro esse arquivo**, selecionar candidatas pelas fontes oficiais / skills.sh, confirmar qualidade e consultar o [catálogo do projeto](../../../docs/engineering/skills-catalog.md).

Não é necessário executar a CLI se o Node instalado for incompatível; verificar GitHub e catálogo por fontes confiáveis também é um método válido. Instalação global de skills ou execução de scripts de terceiros precisa de autorização explícita.

## Quando consultar

- Uma tarefa exige práticas de engenharia React/TypeScript além do contexto local.
- É necessário avaliar acessibilidade, UX, qualidade CSS, componentes e desempenho.
- Há bugs de layout, regressões responsivas ou necessidade de testes E2E e revisão visual.
- Uma biblioteca proposta precisa de orientação especializada antes de ser incorporada.

## Procedimento seguro

1. Classificar a tarefa: **Design/UI**, **React e estado**, **CSS/componentes**, **Acessibilidade**, **Testes**, **Build/performance**, **Segurança**.
2. Consultar a seção relevante do catálogo e selecionar **no máximo 1–2 referências por problema** para evitar instruções conflitantes.
3. Conferir o repositório original de cada candidata e ler o `SKILL.md`, licença, requisitos, manutenção e compatibilidade com o stack.
4. Comparar a recomendação com `AGENTS.md`, Constituição, Spec Kit e código existente. **Os requisitos locais prevalecem**.
5. Adotar as diretrizes pertinentes como referência; instalação de script, CLI ou dependência só após avaliar risco, necessidade e impacto.
6. Documentar a origem da orientação, decisão tomada e evidência de teste. Não declarar skill externa instalada se apenas foi consultada.

## Skills locais já registradas

As seguintes integrações de projeto estão disponíveis em `.agents/skills/`: `frontend-design`, `ui-ux-pro-max`, `frontend-ui-engineering`, `ui-animation` e `web-design-guidelines`. Priorize a leitura dessas orientações antes de buscar alternativas externas, sem presumir que os toolkits completos dos fornecedores estejam instalados.

## Pistas iniciais adequadas ao BlockDOM

| Foco | Skill/repositório a avaliar | Benefício potencial |
| --- | --- | --- |
| Identidade visual e UX | [Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) | Direção visual própria e crítica de interface |
| Arquitetura de interface | [Addy Osmani frontend-ui-engineering](https://github.com/addyosmani/agent-skills) | Orientação local criada; fonte externa disponível para revisão |
| Otimização React | [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills) | Renders, arquitetura e bundle |
| Qualidade web | [Addy Osmani web-quality-skills](https://github.com/addyosmani/web-quality-skills) | A11y, performance e comportamento do navegador |
| E2E | [Microsoft Playwright CLI](https://github.com/microsoft/playwright-cli) | Testes funcionais de navegação e regressão |

Estes são **candidatos**, não instalações nem recomendações para incorporá-los todos ao repositório. A seleção final deve acompanhar o requisito da tarefa e a verificação da fonte.

## Aplicação ao BlockDOM

Ao revisar o laboratório:

- **UI/UX:** confirmar que blocos, toolbox, preview e painel de feedback continuam legíveis e operáveis.
- **React:** monitorar inicialização, ciclo de vida e descarte de workspaces Blockly; preservar event listeners no StrictMode.
- **Performance:** investigar bundle e número de blocos com medições concretas.
- **Acessibilidade:** não presumir que recursos da biblioteca garantem acessibilidade de blocos customizados.
- **Testes:** manter Vitest + Playwright como base e registrar cobertura real antes de avançar de fase.
- **Segurança:** não ativar script, conexões externas ou permissões do iframe para resolver problemas visuais.

## Limites

- A lista externa pode mudar ao longo do tempo. Reabrir a fonte original quando precisar de instruções atualizadas.
- Não copiar automaticamente conteúdo de terceiros sem conferir licença.
- Não executar comando `npx skills add` em máquinas conectadas sem verificar proveniência e efeito no projeto.
- Esta skill não implica instalação nativa dentro do ChatGPT; ela é uma **orientação versionada do projeto**.
