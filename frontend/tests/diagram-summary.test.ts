import {describe,expect,it,vi} from "vitest";
import type {Task,Scenario} from "../src/lib/contracts";
import {
  createDiagramEvidence,chunkDiagramEvidence,coverageLine,summaryInput,
  finalDiagramContext,SUMMARY_CHUNK_LIMIT
} from "../src/features/diagrams/diagram-summary";
import {
  requestAiDiagramSummary,requestAiDiagram
} from "../src/lib/legacy/qa-mermaid-ai.mjs";

const id="11111111-1111-4111-8111-111111111111";
const task={
  id,titulo:"Conciliação e descontos",user_id:"22222222-2222-4222-8222-222222222222",
  descricao:"Conferir valores e registrar diferenças",status:"em_teste",
  correcao:"Atualizar regra de cálculo",causa:"Rateio incorreto"
} as Task;
const status=["aprovado","reprovado","bloqueado","nao_executado"] as const;
function scenario(index:number):Scenario{
  return {
    id:"33333333-3333-4333-8333-"+String(index).padStart(12,"0"),
    tarefa_id:id,user_id:task.user_id,ordem:index,titulo:"Conferência "+index,
    passos:"Acessar a tela "+index+" e conferir a operação "+("etapas ".repeat(150)),
    esperado:"Resultado adequado "+index,
    obtido:index%4===1?"Falhou ao processar":index%4===0?"Registrado":"",observacoes:"",
    status:status[index%4]
  } as Scenario;
}
const requirement={
  id:"44444444-4444-4444-8444-444444444444",tarefa_id:id,
  codigo:"RF-01",titulo:"Validar total",descricao:"Conferir valor",
  criterios_aceite:"Diferenças são registradas"
};

describe("Síntese integral de TF para diagramas",()=>{
  it("inclui todos os 80 cenários, requisitos aprovados e estados sem cortar os últimos",()=>{
    const scenarios=Array.from({length:80},(_,i)=>scenario(i));
    const {source,coverage}=createDiagramEvidence(task,scenarios,[requirement]);
    expect(source).toContain("Conferência 79");
    expect(source).toContain("CENÁRIO 80");
    expect(source).toContain("RF-01");
    expect(source).toContain("REPROVADO / falhou em teste");
    expect(source).toContain("BLOQUEADO / não foi possível validar");
    expect(coverage).toMatchObject({
      total:80,passed:20,failed:20,blocked:20,pending:20,requirements:1
    });
    const parts=chunkDiagramEvidence(source);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every(part=>part.length<=SUMMARY_CHUNK_LIMIT)).toBe(true);
    expect(parts.join("")).toBe(source); // no silent truncation of source
    expect(summaryInput(parts.at(-1)!,parts.length-1,parts.length))
      .toContain("PARTE "+parts.length+"/"+parts.length);
  });

  it("mantém blocos muito longos inteiros através dos limites de lote",()=>{
    const huge={...scenario(2),passos:"X".repeat(45000)} as Scenario;
    const {source}=createDiagramEvidence(task,[huge],[]);
    const parts=chunkDiagramEvidence(source);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.join("")).toBe(source);
  });

  it("exclui cenários/requisitos de outras TFs, não expõe email ou CPF e não inventa sucesso",()=>{
    const other={...scenario(99),tarefa_id:"55555555-5555-4555-8555-555555555555"};
    const {source,coverage}=createDiagramEvidence({...task,
      descricao:"Contato fulano@teste.com CPF 123.456.789-01"
    } as Task,[scenario(1),other],[requirement,{...requirement,id:"r2",tarefa_id:other.tarefa_id}]);
    expect(coverage.total).toBe(1);
    expect(coverage.failed).toBe(1);
    expect(source).not.toContain("Conferência 99");
    expect(source).not.toContain("fulano@teste.com");
    expect(source).toContain("[E-MAIL OMITIDO]");
    const text=finalDiagramContext("Falhou o processamento",coverage,"Destaque erros");
    expect(text).toContain("reprovados");
    expect(text).toContain("somente cenários aprovados comprovam sucesso");
    expect(text).toContain("Destaque erros");
    expect(coverageLine(coverage)).toContain("1 cenários");
  });

  it("resumos só aceitos quando completos e envio estrito não cai em diagrama genérico",async()=>{
    const db={functions:{invoke:vi.fn().mockResolvedValueOnce({
      data:{provider:"NVIDIA Build",summary:"FUNCIONALIDADES: verificar descontos. FALHAS: conciliação sem retorno."},
      error:null
    }).mockResolvedValueOnce({
      data:{mermaid:null},error:null
    })}};
    const text=await requestAiDiagramSummary({db:db as never,text:"Relatório de testes e estados."});
    expect(text).toContain("FALHAS");
    expect(db.functions.invoke.mock.calls[0][1].body.mode).toBe("diagram-summary");
    await expect(requestAiDiagram({
      db:db as never,text:"Síntese confirmada",strict:true
    })).rejects.toThrow(/NVIDIA não retornou/);
  });
});
