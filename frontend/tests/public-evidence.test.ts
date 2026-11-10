import {describe,it,expect} from "vitest";
import {publicEvidenceSchema,publicSourceSchema,publicDocumentSchema} from "../src/features/public/public-data";
const id="11111111-1111-4111-8111-111111111111";
describe("Anexos herdam a visibilidade da TF",()=>{
 it("aceita arquivos gerais, PDF e imagens sem exigir cenário ou autorização individual",()=>{
  for(const mime_type of ["image/png","application/pdf","text/plain"]){
   const item=publicEvidenceSchema.parse({id,cenario_id:null,nome_original:"arquivo",descricao:"",mime_type,publica:false,objeto_path:"private/secret",user_id:"owner"});
   expect(item.cenario_id).toBe(null);
   expect(item).not.toHaveProperty("publica");expect(item).not.toHaveProperty("objeto_path");expect(item).not.toHaveProperty("user_id");
  }
 });
 it("publica texto de fontes e relatórios sem expor caminhos ou credenciais",()=>{
  const source=publicSourceSchema.parse({id,tipo_fonte:"arquivo",nome_arquivo:"fonte.docx",mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",versao:1,texto_extraido:"Requisito",created_at:"2026-11-10",storage_path:"private/path"});
  expect(source.texto_extraido).toBe("Requisito");expect(source).not.toHaveProperty("storage_path");
  const document=publicDocumentSchema.parse({id,tipo:"post",titulo:"Resultado",conteudo:"Reprovado",versao:1,created_at:"2026-11-10",user_id:"private"});
  expect(document.conteudo).toBe("Reprovado");expect(document).not.toHaveProperty("user_id");
 });
});
