import { describe, expect, it } from "vitest";
import type { Task, Scenario } from "../src/lib/contracts";
import {
  buildDiagramPrompt
} from "../src/features/diagrams/diagram-context";
import { cleanMermaid, fallbackFlowchart } from "../src/lib/legacy/qa-mermaid-ai.mjs";

const taskId="11111111-1111-4111-8111-111111111111";
const secondId="22222222-2222-4222-8222-222222222222";
const task={
  id:taskId,user_id:secondId,titulo:"Testar descontos",
  descricao:"Ao concluir, conferir o valor.",
  tipo_teste:"BUILD",status:"em_teste",codigo:"67866",
  sistema:"Vendas",versao:"12.03",publica:false
} as Task;
const scenario={
  id:"33333333-3333-4333-8333-333333333333",
  tarefa_id:taskId,user_id:secondId,titulo:"Remover desconto",
  passos:"Abrir pedido e remover desconto",esperado:"Total atualizado",
  obtido:"",observacoes:"",status:"nao_executado",ordem:1
} as Scenario;
const requirement={
  id:"44444444-4444-4444-8444-444444444444",
  tarefa_id:taskId,codigo:"RF-001",titulo:"Atualizar valor",
  descricao:"Recalcular total ao excluir desconto.",criterios_aceite:"Exibir valor final correto."
};
const args={
  mode:"task" as const,task,scenarios:[scenario],
  selectedScenarioIds:[scenario.id],requirements:[requirement],
  selectedRequirementIds:[requirement.id],manual:""
};

describe("IA de diagramas no React — seleção e privacidade",()=>{
  it("compõe somente dados selecionados da TF e requisitos autorizados",()=>{
    const text=buildDiagramPrompt(args);
    expect(text).toContain("Remover desconto");
    expect(text).toContain("RF-001");
    expect(text).toContain("Recalcular total");
    expect(text).toContain("DADOS DA TF");
    expect(text).not.toContain("user_id");
  });
  it("não envia cenários de outras TFs, nem permite IDs de seleção desatualizados",()=>{
    expect(()=>buildDiagramPrompt({
      ...args,scenarios:[{...scenario,tarefa_id:secondId}]
    })).toThrow("de outra TF");
    expect(()=>buildDiagramPrompt({
      ...args,selectedScenarioIds:[secondId]
    })).toThrow("desatualizada");
    expect(()=>buildDiagramPrompt({
      ...args,requirements:[{...requirement,tarefa_id:secondId}]
    })).toThrow("não pertencem à TF");
  });
  it("oculta emails e CPF conhecidos sem inventar resultado executado",()=>{
    const text=buildDiagramPrompt({...args,manual:"Contato exemplo@dominio.com CPF 123.456.789-01"});
    expect(text).not.toContain("exemplo@dominio.com");
    expect(text).not.toContain("123.456.789-01");
    expect(text).toContain("[E-MAIL OMITIDO]");
    expect(text).not.toContain("Status: Aprovado");
  });
  it("texto livre não mistura dados da tarefa com o texto personalizado",()=>{
    const text=buildDiagramPrompt({...args,mode:"text",manual:"Cliente acessa tela, confere saldo."});
    expect(text).toContain("Cliente acessa");
    expect(text).not.toContain("Testar descontos");
    expect(text).not.toContain("RF-001");
    expect(()=>buildDiagramPrompt({...args,mode:"text",manual:"  "})).toThrow("Descreva");
  });
  it("não limita artificialmente 19 cenários e avisa se o contexto direto exceder 20 mil",()=>{
    const lots=Array.from({length:19},(_,i)=>({
      ...scenario,id:"33333333-3333-4333-8333-"+String(i+1).padStart(12,"0"),
      titulo:"Conferência "+i
    }));
    const result=buildDiagramPrompt({
      ...args,scenarios:lots,selectedScenarioIds:lots.map(s=>s.id)
    });
    expect(result).toContain("Conferência 18");
    expect(()=>buildDiagramPrompt({...args,manual:"x".repeat(20000)})).toThrow(/ultrapass|excede/);
  });
  it("sanitiza Mermaid gerado e rejeita comandos não permitidos",()=>{
    expect(cleanMermaid("flowchart TD\n A[Início] --> B[Fim]"))
      .toContain("flowchart LR");
    expect(()=>cleanMermaid("flowchart LR\n A --> B\n click A href \"javascript:alert(1)\""))
      .toThrow("não permitidos");
    expect(()=>cleanMermaid("javascript:alert(1)"))
      .toThrow("não retornou");
    expect(cleanMermaid(fallbackFlowchart("Iniciar\nVerificar\nConcluir")))
      .toContain("-->");
  });
});
