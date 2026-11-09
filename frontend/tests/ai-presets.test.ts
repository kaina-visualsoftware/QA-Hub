import {describe,expect,it} from "vitest";
import type { Task } from "../src/lib/contracts";
import {
  combinedInstructions,diagramPresetInstruction,generatorPresetInstruction,
  generatorPresets,diagramPresets
} from "../src/features/generators/ai-presets";
import {buildDiagramPrompt} from "../src/features/diagrams/diagram-context";

const sampleTask={
  id:"11111111-1111-4111-8111-111111111111",
  titulo:"Conferência de pedidos",descricao:"Conferir totais e registrar resultado"
} as Task;

describe("F2 — presets de geração e contexto inspecionável",()=>{
  it("oferece modelos explícitos para os três tipos de saída",()=>{
    expect(generatorPresets.teste.length).toBeGreaterThanOrEqual(3);
    expect(generatorPresets.post.length).toBeGreaterThanOrEqual(3);
    expect(diagramPresets.length).toBeGreaterThanOrEqual(3);
  });
  it("não injeta instruções inventadas em modelo padrão ou inválido",()=>{
    expect(generatorPresetInstruction("teste","essencial")).toBe("");
    expect(generatorPresetInstruction("post","__invalid__")).toBe("");
    expect(diagramPresetInstruction("__invalid__")).toBe("");
    expect(combinedInstructions("teste","essencial","")).toMatch(/EVITE REPETIÇÕES/);
    expect(combinedInstructions("post","essencial","")).toBe("");
  });
  it("insere modelo e complemento no mesmo contexto que o usuário pode conferir",()=>{
    const text=combinedInstructions("teste","regressao","Conferir retorno do estorno");
    expect(text).toContain("casos de regressão");
    expect(text).toContain("Conferir retorno do estorno");
    expect(text).not.toContain("senha");
  });
  it("inclui o estilo escolhido sem misturar dados da TF no texto livre",()=>{
    const instruction=diagramPresetInstruction("decisoes");
    const data=buildDiagramPrompt({
      mode:"text",task:sampleTask,scenarios:[],
      selectedScenarioIds:[],requirements:[],selectedRequirementIds:[],
      manual:"Validar desconto antes de concluir",
      styleInstruction:instruction
    });
    expect(data).toContain(instruction);
    expect(data).toContain("Validar desconto");
    expect(data).not.toContain(sampleTask.titulo);
    expect(()=>buildDiagramPrompt({
      mode:"text",task:sampleTask,scenarios:[],
      selectedScenarioIds:[],requirements:[],selectedRequirementIds:[],
      manual:" ",styleInstruction:instruction
    })).toThrow("Descreva");
  });
});
