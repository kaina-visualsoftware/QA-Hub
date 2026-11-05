# Criação de TF — simplificação de interface

A tela **Nova TF** foi redesenhada para executar uma ação por vez:

- **Etapa 1 — Descrição:** uma área para colar o relatório, uma ação principal (**Gerar com IA**), uma alternativa (**Extrair sem IA**), um link de preenchimento manual e o modelo no dispositivo recolhido em **Outra opção de IA**. O clique em Gerar com IA envia o texto à NVIDIA, informado de maneira sucinta ao lado da caixa.
- **Carregamento:** um único painel com spinner, mensagem curta e progresso útil. O botão fica desativado, **sem um segundo spinner**. Mensagens duplicadas de status e prévias que não eram utilizadas foram eliminadas. Erros ficam próximos ao campo, sem duplicação com toast.
- **Etapa 2 — Revisão:** primeiro aparecem os campos essenciais; detalhes de ambiente/base e análise técnica podem ser expandidos quando necessários. Se a IA reconhecer dados adicionais, essas seções abrem automaticamente.
- **Salvar TF:** existe somente **no rodapé do formulário**, após a conclusão, com ação de cancelar. O botão **Excluir TF** também permanece no rodapé, apenas ao editar TF existente.
- **Compatibilidade:** mantidos nomes, limites e valores dos campos enviados ao Supabase, cenários não executados e opção de voltar ao texto.
- **Rascunhos:** após salvar com sucesso, o indicador de texto não salvo é limpo junto ao do formulário.

## Validação

A suíte Chromium (fixture sintética do Supabase) verifica que só existe um spinner durante a geração, que o rodapé do formulário contém Salvar TF, que os detalhes opcionais começam fechados, e exercita 320, 390, 768 e 1366 px. As capturas da etapa 1, loading e etapa 2 são anexadas ao workflow do PR. Testes com dados reais, leitor de tela e provedores de IA são uma homologação separada.
