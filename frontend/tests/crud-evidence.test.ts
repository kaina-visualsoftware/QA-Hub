import {describe,it,expect} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {removeEvidenceFile,updateEvidenceDescription,fileStoragePath} from "../src/features/evidence/evidence-files";
import type {EvidenceFile} from "../src/features/evidence/evidence-files";

const uid="11111111-1111-4111-8111-111111111111";
const task="22222222-2222-4222-8222-222222222222";
const id="44444444-4444-4444-8444-444444444444";
const sample=():EvidenceFile=>({
  id,tarefa_id:task,user_id:uid,cenario_id:"33333333-3333-4333-8333-333333333333",
  nome_original:"screenshot.png",mime_type:"image/png",tamanho_bytes:4096,
  objeto_path:fileStoragePath(uid,task,id,"png"),
  descricao:"Observação inicial",created_at:"2026-11-10T14:00:00Z"
});
function client(log:string[]) {
 const query={
   eq(_key:string,_value:unknown){return this;},
   update(values:Record<string,unknown>){log.push("update:"+JSON.stringify(values));return this;},
   delete(){log.push("delete-meta");return this;},
   select(_fields:string){return this;},
   maybeSingle:async()=>({data:{id},error:null}),
   single:async()=>({data:{id,publica:false},error:null})
 };
 return {
   from(table:string){expect(table).toBe("qa_evidencia_arquivos");return query;},
   storage:{from(bucket:string){
     expect(bucket).toBe("qa-evidence-private");
     return {remove:async(paths:string[])=>{
       log.push("remove-object:"+paths.join("|"));return {error:null};
     }};
   }}
 } as unknown as SupabaseClient;
}
describe("CRUD de evidências por proprietário",()=>{
 it("salva apenas descrição, sem alterar objeto, dono ou situação",async()=>{
   const log:string[]=[];
   await updateEvidenceDescription(client(log),sample(),uid,task," Nota atualizada ");
   expect(log).toEqual(['update:{"descricao":"Nota atualizada"}']);
 });
 it("exclui metadados para revogar acesso, depois remove o arquivo órfão",async()=>{
   const log:string[]=[];
   await removeEvidenceFile(client(log),sample(),uid,task);
   expect(log).toEqual([
     "delete-meta",
     "remove-object:"+fileStoragePath(uid,task,id,"png")
   ]);
 });
 it("nunca permite gerenciar um anexo de outro usuário ou TF",async()=>{
   const log:string[]=[];
   const db=client(log);
   await expect(removeEvidenceFile(db,sample(),"55555555-5555-4555-8555-555555555555",task))
     .rejects.toThrow(/sem autorização/);
   await expect(updateEvidenceDescription(db,sample(),uid,
     "55555555-5555-4555-8555-555555555555","x"))
     .rejects.toThrow(/sem autorização/);
   expect(log).toEqual([]);
 });
 it("rejeita observações acima do limite sem fazer update",async()=>{
   const log:string[]=[];
   await expect(updateEvidenceDescription(client(log),sample(),uid,task,"a".repeat(1001)))
     .rejects.toThrow("1.000 caracteres");
   expect(log).toEqual([]);
 });
});
