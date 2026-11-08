import {describe,expect,it} from "vitest";
import {PDFDocument} from "pdf-lib";
import type {Task,Scenario} from "../src/lib/contracts";
import {buildQaReportPdf} from "../src/features/documents/qa-report-pdf";

const task={
  id:"22222222-2222-4222-8222-222222222222",
  user_id:"11111111-1111-4111-8111-111111111111",
  codigo:"QA-78",titulo:"Validação de descontos e estornos",
  status:"em_teste",tipo_teste:"BUILD",sistema:"Financeiro",versao:"12.08"
} as Task;
const scenario={
  id:"33333333-3333-4333-8333-333333333333",
  tarefa_id:task.id,status:"aprovado",titulo:"Desconto atualizado"
} as Scenario;

describe("F3: exportação de PDF sem persistir alterações",()=>{
  it("gera PDF válido, com título, layout e páginas em casos extensos",async()=>{
    const lines=Array.from({length:210},(_,i)=>
      "## Cenário "+i+"\nResultado registrado em relatório "+i+": "+
      "valor corrigido após a atualização.");
    const bytes=await buildQaReportPdf({
      task,scenarios:[scenario],
      content:"# RELATÓRIO\n"+lines.join("\n"),
      generatedAt:new Date("2026-11-08T15:00:00Z")
    });
    expect(new TextDecoder().decode(bytes.slice(0,8))).toContain("%PDF-");
    const pdf=await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getTitle()).toContain("Validação");
    expect(task.status).toBe("em_teste");
  });
  it("não exporta relatório vazio ou acima do limite",async()=>{
    await expect(buildQaReportPdf({task,scenarios:[],content:"   "})).rejects.toThrow();
    await expect(buildQaReportPdf({task,scenarios:[],content:"x".repeat(80001)}))
      .rejects.toThrow();
  });
});
