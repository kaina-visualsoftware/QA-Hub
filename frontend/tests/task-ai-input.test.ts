import {afterEach,describe,it,expect,vi} from "vitest";
import {supabase} from "../src/lib/supabase";
import {generateTaskAiDraft} from "../src/features/tasks/task-ai";
vi.mock("../src/lib/supabase",()=>({supabase:{functions:{invoke:vi.fn()}}}));
afterEach(()=>vi.restoreAllMocks());

const source=[
 "QUAL É O PROBLEMA IDENTIFICADO?--",
 "Ao excluir o desconto do pedido 67866, o valor permanece inalterado.",
 "ANÁLISE DE VIABILIDADE:",
 "A rotina antiga ignora percentuais negativos dos kits.",
 "O QUE O DESENVOLVEDOR ALTEROU:",
 "A remoção agora considera os descontos negativos."
].join("\n");
function reply(draft:Record<string,unknown>){
 return {data:{provider:"NVIDIA Build",draft},error:null};
}
describe("TF: somente a NVIDIA produz dados estruturados",()=>{
 it("envia uma TF maior que 80 mil caracteres sem truncamento local",async()=>{
  const text="Condição de erro na emissão. ".repeat(4000)+" FIM DA TAREFA";
  const invoke=vi.spyOn(supabase.functions,"invoke").mockResolvedValue(
   reply({titulo:"Análise completa",descricao:"Revisar a emissão"}) as never);
  const result=await generateTaskAiDraft(text);
  expect(invoke.mock.calls[0][1]?.body).toEqual({text});
  expect(result.fields.titulo).toBe("Análise completa");
  expect(result.extractionSource).toBe("nvidia");
 });
 it("preserva objetivo recebido do modelo dentro das observações",async()=>{
  vi.spyOn(supabase.functions,"invoke").mockResolvedValue(reply({
   titulo:"Cenários de desconto",
   cenarios:[{titulo:"Remover desconto",passos:"1. Abrir pedido.",
    esperado:"O valor deve zerar.",objetivo:"Validar a remoção do desconto."}]
  }) as never);
  const draft=await generateTaskAiDraft(source);
  expect(draft.cenarios[0].observacoes).toContain("Validar a remoção");
  expect(draft.cenarios[0].status).toBe("nao_executado");
 });
 it("não inventa dados ausentes na resposta NVIDIA nem complementa via parser local",async()=>{
  vi.spyOn(supabase.functions,"invoke").mockResolvedValue(reply({
   titulo:"Testar remoção de descontos",
   cenarios:[{titulo:"Remover desconto",passos:"Abrir pedido 67866.",esperado:""}]
  }) as never);
  const result=await generateTaskAiDraft(source);
  expect(result.extractionSource).toBe("nvidia");
  expect(result.fields.titulo).toBe("Testar remoção de descontos");
  expect(result.fields.causa).toBeUndefined();
  expect(result.fields.correcao).toBeUndefined();
  expect(result.cenarios[0].esperado).toBe("");
 });
 it("recusa sucesso HTTP 200 vazio e fallback local disfarçado de NVIDIA",async()=>{
  const invoke=vi.spyOn(supabase.functions,"invoke");
  for(const data of [
   {provider:"NVIDIA Build",fallback:true,draft:{}},
   {provider:"NVIDIA Build",draft:{}},
   {provider:"NVIDIA Build",draft:null},
   {provider:"Fonte desconhecida",draft:{titulo:"Suspeito"}}
  ]){
   invoke.mockResolvedValue({data,error:null} as never);
   await expect(generateTaskAiDraft(source)).rejects.toThrow();
  }
 });
 it("devolve erro recuperável em HTTP 503 sem extrair localmente",async()=>{
  vi.spyOn(supabase.functions,"invoke").mockResolvedValue({data:null,error:{
   context:{status:503,json:async()=>({error:"ai_temporarily_unavailable",
    message:"A NVIDIA está temporariamente indisponível."})}
  }} as never);
  await expect(generateTaskAiDraft(source)).rejects.toThrow(/temporariamente indisponível/);
 });
 it("propaga quotas, erros de autenticação e de configuração",async()=>{
  const invoke=vi.spyOn(supabase.functions,"invoke");
  for(const error of [
   {status:401,error:"unauthorized",message:"Faça login"},
   {status:503,error:"nvidia_key_invalid",message:"Chave inválida"},
   {status:503,error:"rate_limit_not_ready",message:"Controle de limite indisponível"}
  ]){
   invoke.mockResolvedValue({data:null,error:{context:{
    status:error.status,json:async()=>error
   }}} as never);
   await expect(generateTaskAiDraft(source)).rejects.toThrow(error.message);
  }
 });
 it("respeita erro 429 e retoma usando somente a resposta da NVIDIA",async()=>{
  const invoke=vi.spyOn(supabase.functions,"invoke")
   .mockResolvedValueOnce({data:null,error:{context:{
    status:429,json:async()=>({code:"quota_exhausted",error:"rate_limited",
      retry_after_seconds:1,message:"Aguarde a cota"})
   }}} as never)
   .mockResolvedValue(reply({titulo:"Validação pela NVIDIA"}) as never);
  vi.useFakeTimers();
  try{
   const promise=generateTaskAiDraft(source);
   await vi.advanceTimersByTimeAsync(1500);
   const draft=await promise;
   expect(invoke).toHaveBeenCalledTimes(2);
   expect(draft.extractionSource).toBe("nvidia");
   expect(draft.fields.titulo).toBe("Validação pela NVIDIA");
  }finally{vi.useRealTimers();}
 });
 it("não transforma falha de conexão em interpretação da fonte",async()=>{
  vi.spyOn(supabase.functions,"invoke").mockResolvedValue({data:null,
   error:{context:{status:503,json:async()=>{throw Error("No JSON");}}}
  } as never);
  await expect(generateTaskAiDraft("Requisito: conferir a NF de serviço."))
   .rejects.toThrow(/NVIDIA não concluiu/);
 });
});
