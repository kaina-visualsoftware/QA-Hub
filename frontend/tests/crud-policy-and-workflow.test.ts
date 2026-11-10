import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=read("../../supabase/qa_crud_owner_permissions.sql");
const task=read("../src/pages/TaskPage.tsx");
const post=read("../src/features/generators/GeneratorPanel.tsx");
const guided=read("../src/features/executions/GuidedExecution.tsx");
const documents=read("../src/features/documents/DocumentLibrary.tsx");
describe("CRUD com limites de privacidade e histórico",()=>{
 it("não cria políticas de alteração anônima",()=>{
   expect(sql).toMatch(/for update to authenticated/g);
   expect(sql).toMatch(/for delete to authenticated/g);
   expect(sql).not.toMatch(/(?:for update|for delete)\s+to\s+anon/i);
   expect(sql).toContain("user_id=(select auth.uid())");
   expect(sql).toContain("owner_id=(select auth.uid())");
   expect(sql).not.toContain("grant update on public.qa_evidencia_arquivos");
   expect(sql).toContain("grant update(descricao), delete");
 });
 it("somente campos de modelos e nomes de equipes podem ser alterados",()=>{
   expect(sql).toContain("grant update(titulo,passos,esperado,observacoes,modulo,tipo_teste)");
   expect(sql).toContain("grant update(nome) on public.qa_equipes");
   expect(sql).toContain("grant update(texto), delete on public.qa_tarefa_comentarios");
   expect(sql).toContain("grant delete on public.qa_documentos");
 });
 it("a exclusão dos cenários verifica e revoga imagens antes de apagar",()=>{
   const source=read("../src/lib/data.ts");
   const revoke=source.indexOf('.update({publica:false})');
   const deleting=source.indexOf('.from("qa_cenarios").delete()');
   expect(revoke).toBeGreaterThan(0);
   expect(deleting).toBeGreaterThan(revoke);
   expect(source).toContain("Uma imagem ainda está pública.");
   expect(task).toContain("requestScenarioDeletion");
   expect(task).toContain("onDelete={scenario=>void requestScenarioDeletion(scenario)}");
 });
 it("as ações ficam visíveis na lista e execução guiada",()=>{
   expect(task).toContain("qa-scenario-crud-actions");
   expect(guided).toContain("qa-guided-crud-actions");
   expect(guided).toContain("canManage&&");
 });
 it("documentos criam nova versão e exigem confirmação para excluir",()=>{
   expect(documents).toContain("await saveTfDocument(supabase");
   expect(documents).toContain("window.confirm(");
   expect(documents).toContain("Editar nova versão");
 });
 it("prévia não aparece na configuração do post",()=>{
   expect(post).not.toContain("qa-post-empty-preview");
   expect(post).not.toContain("Após gerar, o post ficará disponível aqui");
   expect(post).toContain('!generating && hasOutput && !showSetup');
 });
});
