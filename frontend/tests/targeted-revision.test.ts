import {describe,expect,it} from "vitest";
import {selectionFromText,insertReviewedExcerpt,applyCaseRevision,caseAsMarkdown} from
 "../src/features/generators/targeted-revision";
describe("F3.1 — revisão isolada, sem perda das edições do QA",()=>{
 it("altera somente a seleção indicada e preserva o restante do post",()=>{
  const doc="# Título\n\nAnteriormente, falhava.\n\nAgora, valida corretamente.\n\n**TAREFA:** 88771";
  const before="Agora, valida corretamente.";
  const start=doc.indexOf(before);
  const choice=selectionFromText(doc,start,start+before.length);
  expect(choice).not.toBeNull();
  const out=insertReviewedExcerpt(doc,choice!,"Agora, valida a regra RF-91.");
  expect(out).toContain("Anteriormente, falhava.");
  expect(out).toContain("**TAREFA:** 88771");
  expect(out).not.toContain("Agora, valida corretamente.");
 });
 it("preserva BBCode fora do trecho revisado",()=>{
  const doc="[size=18][b]Título[/b][/size]\n\nAgora funciona.\n\n[b]TAREFA:[/b] 88771";
  const start=doc.indexOf("Agora funciona.");
  const selection=selectionFromText(doc,start,start+"Agora funciona.".length);
  const output=insertReviewedExcerpt(doc,selection!,"Agora valida a nova condição.");
  expect(output).toContain("[size=18][b]Título[/b][/size]");
  expect(output).toContain("[b]TAREFA:[/b] 88771");
 });
 it("recusa seleção que foi modificada ou ficou grande",()=>{
  const old="Informações válidas antes da edição.";
  const selection=selectionFromText(old,0,old.length)!;
  expect(()=>insertReviewedExcerpt("Informações mudadas antes da edição.",selection,
   "Novo texto")).toThrow(/mudou desde a seleção/);
  expect(selectionFromText("123456",0,6)).toBeNull();
 });
 it("regenera um caso sem alterar a seleção nem o ID original",()=>{
  const origin={
   titulo:"Estorno negativo",passos:"Acessar o pedido",esperado:"Saldo correto",
   observacoes:"Observações do QA",source_index:"manual-1",selected:false
  };
  expect(caseAsMarkdown(origin)).toContain("### Resultado esperado");
  const suggestion=[
   "## Cenário — Estornar sem desconto negativo",
   "### Cenário","Verificar estorno.",
   "### Passos","1. Abrir o pedido\n2. Estornar",
   "### Resultado esperado","Saldo permanece correto."
  ].join("\n");
  const updated=applyCaseRevision(origin,suggestion);
  expect(updated.source_index).toBe("manual-1");
  expect(updated.selected).toBe(false);
  expect(updated.passos).toContain("Estornar");
  expect(origin.passos).toBe("Acessar o pedido");
 });
 it("não aceita múltiplos casos como uma revisão isolada",()=>{
  const caseOne="## Cenário — Um\n### Passos\n1. Abrir\n### Resultado esperado\nCorreto";
  const same=caseOne+"\n"+caseOne;
  expect(()=>applyCaseRevision({
    titulo:"Velho",passos:"Antigo",esperado:"Antigo",observacoes:"",
    selected:true,source_index:"1"
  },same)).toThrow(/exatamente um caso/);
 });
});
