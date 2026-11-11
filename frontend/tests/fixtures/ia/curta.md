# TF-101 — Campo de observação em cadastro

## Problema
Ao registrar uma observação, o sistema não mostra o texto após salvar.

## Análise de viabilidade
A interface não atualiza a lista depois da resposta de sucesso.

## Correção
Recarregar a lista após a gravação concluída.

## Teste
Cenário: salvar observação com dois parágrafos.
Passos: entrar no cadastro de teste, preencher e salvar.
Esperado: o texto permanece ao reabrir.
Obtido: não executado.
