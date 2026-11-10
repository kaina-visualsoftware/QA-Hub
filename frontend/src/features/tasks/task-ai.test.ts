import {describe,expect,it} from "vitest";
import type {TaskDraft} from "../../lib/contracts";
import {normalizeDraft} from "../../lib/legacy/qa-assistant.mjs";
import {mergeTaskAiCreation,taskAiFieldValues} from "./task-ai";

const blank=():TaskDraft=>({
  titulo:"",descricao:"",codigo:"",tipo_teste:"BUILD",sistema:"",
  versao:"",ambiente:"",base_teste:"",empresa:"",testador:"",
  explicacao:"",causa:"",correcao:"",conclusao:"",observacoes:""
});
const data={
  titulo:"Corrigir descontos negativos",
  codigo:"67866",tipo_teste:"RELEASE",
  descricao:"Desconto não é removido no pedido.",
  sistema:"Financeiro",versao:"12.08.08.0000",ambiente:"Homologação",
  base_teste:"10861-3",empresa:"Retorno Par",testador:"QA responsável",
  explicacao:"Os kits distribuem descontos por rateio.",
  causa:"A rotina ignorava percentuais negativos.",
  correcao:"O desenvolvedor incluiu os percentuais negativos na limpeza.",
  conclusao:"A correção foi entregue para validação.",
  observacoes:"Validar regressão com kits desdobrados."
};

describe("paridade entre gerar e regenerar dados da TF",()=>{
  it("preenche todos os campos fornecidos pela NVIDIA também na criação",()=>{
    const draft=normalizeDraft(data);
    const merged=mergeTaskAiCreation(blank(),draft);
    const expected=taskAiFieldValues(draft);
    for(const [key,value] of Object.entries(expected)){
      expect(merged[key as keyof TaskDraft],key).toBe(value);
    }
    expect(merged.tipo_teste).toBe("RELEASE");
    expect(merged.descricao).toBe(data.descricao);
    expect(merged.causa).toBe(data.causa);
    expect(merged.correcao).toBe(data.correcao);
  });
  it("na nova análise atualiza somente valores ainda pertencentes à IA",()=>{
    const first=normalizeDraft(data);
    const previous=taskAiFieldValues(first);
    const current={
      ...mergeTaskAiCreation(blank(),first),
      titulo:"Título revisado manualmente",
      descricao:"Descrição revisada manualmente",
      causa:"Causa corrigida pelo QA"
    };
    const second=normalizeDraft({...data,
      versao:"12.08.09.0000",
      titulo:"Outro título sugerido",
      causa:"Nova causa sugerida",
      correcao:"Nova correção documentada"
    });
    const merged=mergeTaskAiCreation(current,second,{previousAiValues:previous});
    expect(merged.titulo).toBe("Título revisado manualmente");
    expect(merged.descricao).toBe("Descrição revisada manualmente");
    expect(merged.causa).toBe("Causa corrigida pelo QA");
    expect(merged.versao).toBe("12.08.09.0000");
    expect(merged.correcao).toBe("Nova correção documentada");
  });
  it("não copia o relatório bruto para uma descrição que a IA não identificou",()=>{
    const draft=normalizeDraft({...data,descricao:""});
    const merged=mergeTaskAiCreation(blank(),draft);
    expect(merged.descricao).toBe("");
    expect(merged.causa).toBe(data.causa);
  });
});
