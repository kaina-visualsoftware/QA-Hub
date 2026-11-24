import {describe,it,expect,vi} from "vitest";
import type {Task} from "../src/lib/contracts";
import {planScenarioSources} from "../src/features/generators/case-source-plan";
import {generateCasesBySource,casePartStatus,caseCheckpoint} from "../src/features/generators/case-chunk-generation";

import {parseGeneratedCases} from "../src/lib/legacy/qa-workspace.mjs";
import type {GeneratorBatchRequest} from "../src/features/generators/stream";
const task=(description:string)=>({
 id:"22222222-2222-4222-8222-222222222222",titulo:"Validar persistência de preços",
 codigo:"67866",descricao:description,sistema:"Vendas",
 explicacao:"A tela lista os produtos.",correcao:"Persistir valor ao salvar.",
 tipo_teste:"BUILD"
}) as Task;
const buildCase=(name:string)=>[
 "## Cenário 01 — "+name,
 "### Cenário","Conferir "+name,
 "### Passos","1. Abrir o pedido.\n2. Alterar o preço.",
 "### Resultado esperado","- O preço é persistido após salvar."
].join("\n");
describe("geração de cenários por fontes",()=>{
 it.each([10000,80000])("mantém todo o texto da TF em partes para %i caracteres",length=>{
  const desc="Regras distintas de preço e persistência.\n".repeat(Math.ceil(length/42)).slice(0,length);
  const plan=planScenarioSources({task:task(desc)});
  const fromTask=plan.parts.filter(p=>p.kind==="task").map(p=>p.text).join("");
  expect(fromTask).toContain(desc);
  expect(plan.parts.length).toBeGreaterThan(1);
  expect(plan.parts.every(p=>p.text.length<=4200)).toBe(true);
  expect(plan.parts.length).toBeLessThan(130);
 });
 it("inclui anexos e requisitos registrados depois da criação",()=>{
  const plan=planScenarioSources({
   task:task("Validar o pedido."),
   requirements:[{id:"r1",codigo:"RF-15",titulo:"Valor unitário",
    descricao:"Conferir preço",criterios_aceite:"Retornar preço gravado",estado:"aprovado"}],
   files:[{id:"f1",tipo_fonte:"arquivo",nome_arquivo:"regras.txt",
    texto_extraido:"Após salvar, manter casas decimais e a ordem dos itens."},
    {id:"f2",tipo_fonte:"arquivo",nome_arquivo:"imagem-sem-texto.png",
     texto_extraido:""}],
   documents:[{id:"d1",titulo:"Relatório de correção",
    conteudo:"Aplicada validação de valor total dos itens."}],
   evidence:[{id:"e1",tipo:"print",resumo:"A grade exibe preços incorretos"}],
   evidenceFiles:[{id:"ef1",nome_original:"comprovante.png",mime_type:"image/png",
     descricao:"O total gravado aparece após reabrir a tela"}]
  });
  expect(plan.parts.map(p=>p.text).join(" ")).toContain("manter casas decimais");
  expect(plan.parts.map(p=>p.text).join(" ")).toContain("Retornar preço gravado");
  expect(plan.parts.map(p=>p.text).join(" ")).toContain("valor total dos itens");
  expect(plan.warnings[0]).toContain("imagem-sem-texto.png");
  expect(plan.warnings.some(w=>w.includes("comprovante.png"))).toBe(true);
  expect(plan.parts.map(p=>p.text).join(" ")).toContain("O total gravado aparece");
  expect(plan.sources.some(s=>s.label==="Anexo: regras.txt")).toBe(true);
 });
 it("gera títulos descritivos até com cabeçalho numérico sem descrição",()=>{
  const value="## Cenário 01\n### Cenário\nValidar total na grade após salvar\n"+
   "### Passos\n1. Abrir pedido.\n### Resultado esperado\n- Total salvo.";
  expect(parseGeneratedCases(value)[0].titulo).toBe("Validar total na grade após salvar");
 });
 it("respeita duas solicitações simultâneas e mantém as partes concluídas na retomada",async()=>{
  const plan=planScenarioSources({task:task("Regras de negócio:\n"+"Regra diferente e verificável.\n".repeat(350))});
  expect(plan.parts.length).toBeGreaterThan(2);
  let active=0,maxActive=0,failIndex=1,firstRun=true;
  const history:number[]=[];
  const mock=vi.fn(async(_mode:string,_task:string,_req:string,
   onChunk:(text:string)=>void,_signal?:AbortSignal,_wait?:unknown,
   batch?:GeneratorBatchRequest)=>{
   const index=batch!.index;history.push(index);active++;
   maxActive=Math.max(maxActive,active);
   try{
    await Promise.resolve();
    if(firstRun&&index===failIndex)throw Error("503 temporário");
    const reply=index===0?buildCase("Persistir preço após salvar"):
     index===2?buildCase("Preservar preço no pedido alternativo"):
     "[Sem cenários nesta parte]";
    onChunk(reply);
    return {text:reply,truncated:false};
   }finally{active--;}
  });
  let checkpoint=caseCheckpoint(plan);
  const initial=await generateCasesBySource(plan,{request:mock as never,
   onCheckpoint:cp=>{checkpoint=cp;}});
  expect(maxActive).toBeLessThanOrEqual(2);
  expect(maxActive).toBeGreaterThan(1);
  expect(initial.failed).toBe(1);
  expect(initial.cases.every(c=>c.titulo&&!/^Cenário \d+$/.test(c.titulo))).toBe(true);
  expect(casePartStatus(plan,checkpoint).failed).toBe(1);
  firstRun=false;const prev=[...history];const retried=await generateCasesBySource(plan,{
   checkpoint,request:mock as never,onCheckpoint:cp=>{checkpoint=cp;}
  });
  expect(history.slice(prev.length)).toEqual([failIndex]);
  expect(retried.failed).toBe(0);
  expect(retried.allDone).toBe(true);
 });
});
