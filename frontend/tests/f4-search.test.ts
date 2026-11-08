import {describe,expect,it} from "vitest";
import {TASK_SEARCH_SIZE,normalizeTaskFilters} from "../src/features/tasks/task-search-data";
import {changedFields,HISTORY_SIZE} from "../src/features/history/execution-history-data";

describe("F4 — pesquisa e histórico",()=>{
  it("normaliza filtros com limites e sem aceitar estados inválidos",()=>{
    expect(TASK_SEARCH_SIZE).toBe(30);
    expect(normalizeTaskFilters({search:"  financeiro  ",status:"em_teste",type:"RELEASE"}))
      .toEqual({search:"financeiro",status:"em_teste",type:"RELEASE"});
    expect(normalizeTaskFilters({search:"x".repeat(200),status:"invalid",type:"admin"}))
      .toEqual({search:"x".repeat(120),status:"",type:""});
  });
  it("compara campos armazenados sem inventar alterações",()=>{
    expect(changedFields({codigo:"TF-2",versao:"1.0",status:"rascunho"},
      {codigo:"TF-2",versao:"1.1",status:"aprovado"}))
      .toEqual([
        {field:"versao",old:"1.0",next:"1.1"},
        {field:"status",old:"rascunho",next:"aprovado"}
      ]);
  });
  it("mantém páginas de histórico limitadas",()=>expect(HISTORY_SIZE).toBe(40));
});
