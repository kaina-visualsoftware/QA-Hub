# QA Hub — F2: central de IA simplificada

## Problema

A antiga SPA React mantinha geradores de casos, posts e diagramas em modais separados. Para mudar de produto, o usuário precisava fechar a janela, procurar outra entrada e reconstruir seu contexto visual. Nos geradores de texto, dezenas de campos e métricas eram exibidos antes da ação principal.

## F2 implementada

A TF tem uma **Central de IA** com três opções na mesma janela: Casos, Post e Diagrama. Os atalhos existentes já abrem a opção escolhida, sem adicionar um passo. A pessoa pode mudar de modo dentro da janela sem perder a prévia editada anteriormente.

- **Casos:** selecione Cobertura principal (padrão), Regressão ou Erros e limites; autorize o envio do contexto visível, gere uma prévia e selecione os casos a anexar. A lista mostra título, passos e esperado; edição de todos os campos é opcional por cenário. Casos duplicados permanecem sinalizados e não são importados automaticamente.
- **Posts:** selecione Post padrão, Post enxuto ou Post técnico; gere o modelo obrigatório, revise o Markdown e salve explicitamente na TF. A estrutura obrigatória não foi modificada.
- **Diagramas:** selecione Fluxo principal, Decisões e alternativas ou Falhas e exceções. Continua possível escolher entre dados da TF e texto livre, editar código Mermaid, visualizar, detectar erro pelo parser real e usar Corrigir com IA ou Gerar novamente antes de salvar.
- **Configuração avançada:** requisitos aprovados, contagens, instruções adicionais e informações detalhadas ficam sob expansão opcional. As fontes indisponíveis exigem aviso e consentimento específico, como antes.
- **Regeneração:** gera uma nova versão sem limpar o resultado anterior durante o processamento. Se houver edição humana, pede confirmação antes de substituir. Caso a chamada falhe ou seja cancelada, o texto e os casos anteriores são preservados.
- **Privacidade:** o usuário sempre pode conferir o contexto exato antes de enviar. O consentimento é por contexto e não autoriza envios após alterações sem revisão. O uso da IA não grava TF, caso, post ou diagrama sem confirmação posterior.

## Compatibilidade e limites

- Não há migrações de banco, alterações de RLS, novas credenciais nem serviços externos adicionais.
- Reutiliza a função SSE existente para casos/posts e a função Supabase existente para Mermaid.
- Nenhum resultado de IA é tratado como teste executado ou aprovado.
- Os modelos de geração são instruções fixas no front-end, não uma biblioteca persistente de prompts por usuário.
- Respostas sintaticamente inválidas da IA de Mermaid não são salvas; a validação e a correção continuam exigindo ação do QA.

## Verificação

- TypeScript, lint, build e testes unitários de geração/presets/diagramas.
- E2E de criação e edição de casos, preservação ao alternar modos, regeneração cancelada, erro simulado, post técnico, Mermaid e consentimento.
- Verificação de overflow em 320/390/768/1366 px e axe-core WCAG AA nos três modos.
- Testes em celular físico, acessibilidade assistiva humana e RLS com contas reais continuam para homologação.
