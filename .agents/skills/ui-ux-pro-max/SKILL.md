---
name: ui-ux-pro-max
description: Planejar e revisar sistemas visuais para o BlockDOM usando uma abordagem orientada a dados de UX, acessibilidade, paletas, tipografia, componentes e tecnologia React. Use em redesigns, sistemas de design, novas telas ou auditorias de experiência.
---

# UI/UX Pro Max — Integração de projeto BlockDOM

**Origem:** https://github.com/nextlevelbuilder/ui-ux-pro-max-skill  
**Arquivo upstream:** `.claude/skills/ui-ux-pro-max/SKILL.md`  
**Licença da fonte:** MIT. **Esta é uma adaptação original para BlockDOM, não a distribuição da ferramenta completa.**

## Para que serve

Analisar necessidades reais dos estudantes, escolher padrões de interface consistentes, justificar decisões de design e conferir resultados em testes. Na plataforma, a área útil para encaixar blocos e compreender a relação HTML/CSS tem prioridade sobre ornamentação.

**Observação essencial:** o projeto **não inclui** os arquivos CSV, referências, mecanismo Python de busca ou gerador de design system distribuídos no repositório original. Não inventar resultados de consultas ao banco da ferramenta. Se a tarefa exigir busca automatizada, instalar o pacote oficial separadamente após verificar a fonte, a versão, as dependências e a política de segurança; documentar essa decisão. Apenas ler este arquivo não habilita a busca.

## Quando aplicar

- Planejar uma interface nova, revisão de tela existente ou design system.
- Investigar contraste, densidade, hierarquia, tipografia, estados, interação e responsividade.
- Definir padrões de feedback e acessibilidade para editores por blocos.
- Auditar se a interface atende objetivos mensuráveis dos usuários.

Não utilizar para modificar código de backend, persistência ou API sem necessidade de interface correspondente.

## Etapas práticas

### 1. Levantar contexto

Identifique tipo de produto (ferramenta educacional), audiência (14–17 anos), equipamento primário (notebook/desktop), fluxo e critério observável de sucesso. Inspecione o código e o layout existente antes de propor alternativas.

### 2. Construir direção visual

Proponha uma ficha curta com:

- **Objetivo da tela:** o que o estudante realiza sem sair do contexto.
- **Paleta:** tokens semânticos de fundo, superfície, texto, foco, sucesso, atenção e erro, além de categorias HTML e CSS.
- **Tipografia:** escala legível para rótulos, campos dos blocos e instruções. Não usar texto diminuto para ganhar espaço.
- **Densidade:** largura de toolbox, áreas de trabalho, prévia e feedback sem corte ou sobreposição.
- **Interações:** estados de seleção, conexão, erro, execução, prévia não atualizada e importação.
- **Não objetivos:** elementos decorativos ou gamificados que não ajudem a aprender na Fase 0.

Compare alternativas e identifique onde o resultado parece genérico demais para um editor educacional.

### 3. Aplicar a matriz de prioridade

1. **Acessibilidade:** teclado, rótulos, foco visível, contrastes adequados, alternativas ao arraste.
2. **Interação:** ações previsíveis, feedback próximo ao controle e espaço para toque.
3. **Performance:** evitar rerender do Blockly a cada alteração, atrasos e deslocamento de layout.
4. **Estilo e hierarquia:** consistência, áreas visuais com importância proporcional às tarefas.
5. **Responsividade:** desktop completo; experiência funcional e sem quebra em tablets/móveis.
6. **Microcópia:** comandos claros para iniciantes e erros com ação corretiva.
7. **Animação:** somente quando orienta ou confirma uma ação, com movimento reduzido.
8. **Progressão:** mostrar conceitos e orientações apenas no momento relevante.

### 4. Verificar no navegador

Testar 390×844, 768×1024 e 1366×768; considerar 320px para fluxos de consulta. Exercitar HTML/CSS simultaneamente, zoom, categorias, campos extensos, erro, prévia e teclado. Validar contraste com medições, não por impressão.

Registrar alterações e evidências no PR. Não declarar aprovação quando só houver proposta estética.

## Busca avançada — apenas se o toolkit oficial estiver instalado

A ferramenta de origem oferece `scripts/search.py` e datasets, com consultas do tipo `--design-system`, `--domain ux` e `--stack react`. **Nenhum desses scripts está instalado por este arquivo.** Usar exclusivamente o caminho e a versão confirmados no ambiente real; para um sistema próprio, registrar resultados relevantes e a fonte no relatório de design. Não criar arquivos `MASTER.md` fictícios.

## Integrações

- **Direção visual:** `frontend-design`.
- **Implementação React:** `frontend-ui-engineering`.
- **Movimento:** `ui-animation`.
- **Auditoria final:** `web-design-guidelines`.
- **Norma local:** `AGENTS.md`, Constitution e Spec Kit prevalecem.

**Definição de pronto:** decisões justificadas, UI implementada se solicitada, verificações reais e pendências documentadas.
