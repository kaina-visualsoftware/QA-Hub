import {describe,expect,it} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {splitTaskFieldSource} from "../src/features/tasks/task-ai-chunks";
import {TaskFieldChunkPanel} from "../src/features/tasks/TaskFieldChunkPanel";

const source=(length:number)=>("RELATO: A conferência fiscal deve respeitar o cadastro.\n")
 .repeat(Math.ceil(length/55)).slice(0,length);

describe("Painel de blocos da criação de TF",()=>{
 it.each([10000,80000])("mostra todos os trechos para %i caracteres",length=>{
  const chunks=splitTaskFieldSource(source(length));
  const html=renderToStaticMarkup(createElement(TaskFieldChunkPanel,{
   chunks,results:{},statuses:{},running:false,quotaWait:null,onCancel:()=>{}
  }));
  expect(html).toContain("Partes da tarefa para análise");
  expect(html).toContain("Parte 01");
  expect(html).toContain("Parte "+String(chunks.length).padStart(2,"0"));
  expect((html.match(/qa-task-chunk--pending/g)||[]).length).toBe(chunks.length);
  expect(html).toContain("Linhas 1");
  expect(html).toContain("Aguardando");
  expect(html).toContain("qa-task-chunks-progress");
 });
 it("distingue partes concluídas, em processamento, com falha e pendentes",()=>{
  const chunks=splitTaskFieldSource(source(18000));
  expect(chunks.length).toBeGreaterThanOrEqual(3);
  const html=renderToStaticMarkup(createElement(TaskFieldChunkPanel,{
   chunks,results:{0:{fields:{titulo:"Conferência fiscal"},review:[]}},
   statuses:{1:"processing",2:"failed"},running:true,quotaWait:null,onCancel:()=>{}
  }));
  expect(html).toContain("campo(s) confirmado(s)");
  expect(html).toContain("Analisando");
  expect(html).toContain("Falhou");
  expect(html).toContain("Interromper");
  expect(html).toContain("Parte 03");
  const proposed=renderToStaticMarkup(createElement(TaskFieldChunkPanel,{
   chunks,results:{0:{fields:{},review:[{field:"titulo",
    value:"Corrigir a validação",quote:"",sourceLine:null,
    status:"needs_review",reason:"quote_not_found",origin:"NVIDIA"}]}},
   statuses:{},running:false,quotaWait:null,onCancel:()=>{}
  }));
  expect(proposed).toContain("sugestão(ões) para revisão");
 });
});
