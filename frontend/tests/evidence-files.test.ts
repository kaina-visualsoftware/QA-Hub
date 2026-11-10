import {describe,expect,it} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {
  assertOwnEvidenceFile,fileStoragePath,readPrivateEvidence,uploadEvidenceFile,
  validateEvidenceFile
} from "../src/features/evidence/evidence-files";
import type {EvidenceFile} from "../src/features/evidence/evidence-files";

const userId="11111111-1111-4111-8111-111111111111";
const taskId="22222222-2222-4222-8222-222222222222";
const scenarioId="33333333-3333-4333-8333-333333333333";
const png=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]);
function sampleFile(){
  return new File([png],"evidencia.png",{type:"image/png"});
}

describe("F3: anexos privados e RLS defensiva no cliente",()=>{
  it("valida bytes, extensão, mime, tamanho e bloqueia arquivos disfarçados",async()=>{
    await expect(validateEvidenceFile(sampleFile()))
      .resolves.toEqual({mime:"image/png",extension:"png"});
    await expect(validateEvidenceFile(new File(["bad"],"invalido.png",{type:"image/png"})))
      .rejects.toThrow("conteúdo");
    await expect(validateEvidenceFile(new File(["alert"],"arquivo.html",{type:"text/html"})))
      .rejects.toThrow("Use PNG");
    await expect(validateEvidenceFile(new File([png],"arquivo.jpg",{type:"image/png"})))
      .rejects.toThrow("tipo do arquivo");
    await expect(validateEvidenceFile(new File([new Uint8Array(0)],"vazio.pdf",{type:"application/pdf"})))
      .rejects.toThrow("10 MB");
  });
  it("nunca aceita caminhos de outros usuários ou TFs",()=>{
    const id="44444444-4444-4444-8444-444444444444";
    const path=fileStoragePath(userId,taskId,id,"png");
    const record={
      id,tarefa_id:taskId,cenario_id:scenarioId, user_id:userId,objeto_path:path,
      mime_type:"image/png",nome_original:"evidencia.png",tamanho_bytes:12,
      descricao:"",created_at:"2026-11-08T00:00:00Z",publica:false
    };
    expect(()=>assertOwnEvidenceFile(record,userId,taskId)).not.toThrow();
    expect(()=>assertOwnEvidenceFile(record,userId,"55555555-5555-4555-8555-555555555555"))
      .toThrow("sem autorização");
    expect(()=>assertOwnEvidenceFile({...record,objeto_path:"../outro.png"},userId,taskId))
      .toThrow("caminho inválido");
    expect(()=>fileStoragePath("wrong",taskId,id,"png")).toThrow();
  });
  it("faz upload imutável e insere metadados somente depois do objeto",async()=>{
    const calls:string[]=[];
    let path="",newId="";
    const fake={
      storage:{from:()=>({
        upload:async(p:string)=>{calls.push("upload");path=p;newId=p.split("/")[2].slice(0,36);return {error:null};},
        remove:async()=>{calls.push("remove");return {error:null};}
      })},
      from:()=>({
        insert:(payload:Record<string,unknown>)=>{
          calls.push("insert");
          expect(payload.objeto_path).toBe(path);
          return {select:()=>({single:async()=>({data:{
            ...payload,created_at:"2026-11-08T00:00:00Z",id:newId
          },error:null})})};
        }
      })
    } as unknown as SupabaseClient;
    const result=await uploadEvidenceFile(fake,{
      file:sampleFile(),userId,taskId,scenarioId,
      scenarioIds:[scenarioId],description:" Captura "
    });
    expect(calls).toEqual(["upload","insert"]);
    expect(result.id).toBe(newId);
    expect(result.descricao).toBe("Captura");
  });
  it("limpa upload órfão quando inserção de metadados falha",async()=>{
    const calls:string[]=[];
    const fake={
      storage:{from:()=>({
        upload:async()=>{calls.push("upload");return {error:null};},
        remove:async()=>{calls.push("cleanup");return {error:null};}
      })},
      from:()=>({insert:()=>({select:()=>({single:async()=>{
        calls.push("db-error");return {data:null,error:new Error("RLS")};
      }})})})
    } as unknown as SupabaseClient;
    await expect(uploadEvidenceFile(fake,{
      file:sampleFile(),userId,taskId,scenarioId:null,
      scenarioIds:[],description:""
    })).rejects.toThrow("RLS");
    expect(calls).toEqual(["upload","db-error","cleanup"]);
  });
  it("não baixa um arquivo com metadados de outro proprietário",async()=>{
    const record={
      id:"44444444-4444-4444-8444-444444444444",
      tarefa_id:taskId,user_id:userId,cenario_id:null,
      objeto_path:"44444444-4444-4444-8444-444444444444/other.pdf",
      mime_type:"application/pdf",
      tamanho_bytes:300,nome_original:"outro.pdf",
      descricao:"",created_at:"2026-11-08T00:00:00Z",publica:false
    } as EvidenceFile;
    await expect(readPrivateEvidence({} as SupabaseClient,record,userId,taskId))
      .rejects.toThrow("caminho inválido");
  });
});
