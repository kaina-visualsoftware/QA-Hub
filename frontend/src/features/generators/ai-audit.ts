/** F3.2 — append-only audit of user decisions and source versions.
 * All fingerprints are SHA-256 digests computed locally. Never write source
 * text, model suggestions or private attachments to the audit table.
 */
import {supabase} from "../../lib/supabase";
import type {SemanticConflict,ConflictDecision} from "./semantic-conflicts";

export type AuditEventType="source_snapshot"|"conflict_decision"|
 "post_revision_applied"|"test_revision_applied"|"coverage_generation_requested";
export type AuditResource="contexto"|"requisito"|"post"|"teste";
export type AuditEvent={
 id:string;tarefa_id:string;user_id:string;event_type:AuditEventType;
 resource:AuditResource;reference_hash:string;source_hash:string;
 before_hash:string|null;after_hash:string|null;requirement_code:string|null;
 decision:ConflictDecision|null;created_at:string;
};
export type ApprovedSource={
 id:string;codigo:string;titulo:string;descricao:string;
 criterios_aceite:string;updated_at:string;
};
export async function sha256(value:string):Promise<string>{
 const bytes=new TextEncoder().encode(value);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
}
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function validateAuditScope(taskId:string,userId:string){
 if(!UUID.test(taskId)||!UUID.test(userId))throw Error("TF ou usuário inválido.");
}
type AuditRow=Pick<AuditEvent,"tarefa_id"|"user_id"|"event_type"|
 "resource"|"reference_hash"|"source_hash"|"before_hash"|
 "after_hash"|"requirement_code"|"decision">;

export async function recordAuditRows(taskId:string,userId:string,rows:Omit<AuditRow,
 "tarefa_id"|"user_id">[]){
 validateAuditScope(taskId,userId);
 if(!rows.length||rows.length>101)throw Error("Quantidade inválida de registros de auditoria.");
 const {error}=await supabase.from("qa_ai_audit_trail").insert(rows.map(row=>({
  ...row,tarefa_id:taskId,user_id:userId
 })));
 if(error)throw Error("Não foi possível registrar a auditoria privada: "+error.message);
}
export async function recordConflictDecision(taskId:string,userId:string,
 sourceText:string,item:SemanticConflict,decision:ConflictDecision){
 const [reference_hash,source_hash,before_hash,after_hash]=await Promise.all([
  sha256(item.id),sha256(sourceText),
  sha256(item.left.quote),sha256(item.right.quote)
 ]);
 await recordAuditRows(taskId,userId,[{event_type:"conflict_decision",
  resource:"contexto",reference_hash,source_hash,before_hash,
  after_hash,requirement_code:null,decision}]);
}
export async function recordAppliedRevision(taskId:string,userId:string,
 sourceText:string,operation:"post_excerpt"|"test_case",before:string,after:string){
 const [source_hash,reference_hash,before_hash,after_hash]=await Promise.all([
  sha256(sourceText),sha256(operation+"|"+before),sha256(before),sha256(after)
 ]);
 await recordAuditRows(taskId,userId,[{
  event_type:operation==="post_excerpt"?"post_revision_applied":"test_revision_applied",
  resource:operation==="post_excerpt"?"post":"teste",
  reference_hash,source_hash,before_hash,after_hash,
  requirement_code:null,decision:null
 }]);
}
export async function recordCoveragePreparation(taskId:string,userId:string,
 sourceText:string,requirementCodes:string[]){
 const [source_hash,reference_hash]=await Promise.all([
  sha256(sourceText),sha256(requirementCodes.slice().sort().join("|"))
 ]);
 await recordAuditRows(taskId,userId,[{
  event_type:"coverage_generation_requested",resource:"teste",
  reference_hash,source_hash,before_hash:null,after_hash:null,
  requirement_code:null,decision:null
 }]);
}
export async function snapshotSources(taskId:string,userId:string,taskSource:string,
 approved:ApprovedSource[]){
 if(approved.length>100)throw Error("É possível registrar até 100 requisitos por versão. Divida a seleção para não perder dados.");
 const rows:Omit<AuditRow,"tarefa_id"|"user_id">[]=[];
 rows.push({event_type:"source_snapshot",resource:"contexto",
  reference_hash:await sha256("TF:"+taskId),
  source_hash:await sha256(taskSource),before_hash:null,after_hash:null,
  requirement_code:null,decision:null});
 for(const item of approved){
  if(!/^(RF|RNF|RN|CA)-[0-9]{3,4}$/.test(item.codigo))continue;
  const source=[item.codigo,item.titulo,item.descricao,
   item.criterios_aceite].join("\n");
  rows.push({event_type:"source_snapshot",resource:"requisito",
   reference_hash:await sha256(item.id),source_hash:await sha256(source),
   before_hash:null,after_hash:null,requirement_code:item.codigo,decision:null});
 }
 await recordAuditRows(taskId,userId,rows);
 return rows.length;
}
export async function readAuditTrail(taskId:string,userId:string){
 validateAuditScope(taskId,userId);
 const {data,error}=await supabase.from("qa_ai_audit_trail")
  .select("id,tarefa_id,user_id,event_type,resource,reference_hash,source_hash,before_hash,after_hash,requirement_code,decision,created_at")
  .eq("tarefa_id",taskId).eq("user_id",userId)
  .order("created_at",{ascending:false}).limit(301);
 if(error)throw Error("Não foi possível ler a auditoria: "+error.message);
 return {rows:(data??[]).slice(0,300) as AuditEvent[],hasMore:(data??[]).length>300};
}
export async function compareSourceVersions(taskId:string,taskText:string,
 approved:ApprovedSource[],events:AuditEvent[]){
 if(!UUID.test(taskId))throw Error("Identificador da TF inválido.");
 const latest=new Map<string,AuditEvent>();
 for(const event of events){
  if(event.event_type!=="source_snapshot")continue;
  const key=event.resource+":"+(event.requirement_code??"TF");
  if(!latest.has(key))latest.set(key,event);
 }
 const result:{code:string;state:"never"|"same"|"changed";date:string|null}[]=[];
 const original=latest.get("contexto:TF");
 result.push({code:"Contexto da TF",state:!original?"never":
  (await sha256(taskText))===original.source_hash?"same":"changed",
  date:original?.created_at??null});
 for(const item of approved){
  const previous=latest.get("requisito:"+item.codigo);
  const text=[item.codigo,item.titulo,item.descricao,item.criterios_aceite].join("\n");
  result.push({code:item.codigo,state:!previous?"never":
   (await sha256(text))===previous.source_hash?"same":"changed",
   date:previous?.created_at??null});
 }
 return result;
}
