import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {publicEvidenceSchema} from "../src/features/public/public-data";
const sql=readFileSync(new URL("../../supabase/qa_public_evidence_optin.sql",import.meta.url),"utf8");
const edge=readFileSync(new URL("../../supabase/functions/qa-public-evidence/index.ts",import.meta.url),"utf8");
const id="11111111-1111-4111-8111-111111111111";
describe("Publicação opcional das capturas de cenários",()=>{
 it("não revela bucket, caminho de arquivo nem dono pela projeção",()=>{
   const item=publicEvidenceSchema.parse({id,cenario_id:id,nome_original:"screenshot.png",
     descricao:"Resultado conferido",mime_type:"image/png",
     objeto_path:"private/secret.png",user_id:"owner-id",token:"secret"});
   expect(item).not.toHaveProperty("objeto_path");
   expect(item).not.toHaveProperty("user_id");
   expect(item).not.toHaveProperty("token");
 });
 it("arquivos existentes permanecem privados",()=>{
   expect(sql).toContain("add column if not exists publica boolean not null default false");
   expect(sql).toContain("and publica is true");
   expect(sql).toContain("and cenario_id is not null");
   expect(sql).toContain("and mime_type in ('image/png','image/jpeg','image/webp')");
   expect(sql).toContain("where t.id = p_task_id and t.publica is true");
   expect(sql).toContain("grant update(publica)");
   expect(sql).not.toMatch(/public\s*=\s*true/);
 });
 it("consulta as duas permissões em cada acesso",()=>{
   expect(edge).toContain("file.publica!==true");
   expect(edge).toContain('publica:"eq.true"');
   expect(edge).toContain("qa-evidence-private");
   expect(edge).toContain('"Cache-Control":"no-store');
   expect(edge).toContain('id:"eq."+scenario');
   expect(edge).not.toContain("getPublicUrl");
 });
});
