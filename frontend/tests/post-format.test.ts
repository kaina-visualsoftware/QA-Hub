import {describe,it,expect} from "vitest";
import {markdownToBbcode,validateBbcodePost} from "../src/features/generators/post-format";
const sample=[
 "# TESTE DE DESCONTO","---","A correção foi implementada.",
 "Anteriormente, o desconto permanecia. Agora, a rotina remove corretamente.",
 "**Caminho de acesso:**",
 "**Financeiro >> Pagamentos >> Remover desconto**",
 "[Imagem: captura-da-funcionalidade.png]","**Comportamento detalhado**","---",
 "1. **Validar desconto**","O desconto deve ser removido.","---",
 "**TAREFA:** 67866","**JUSTIFICATIVA:** Corrigir a divergência"
].join("\n");
describe("Saída BBCode do gerador de post",()=>{
 it("converte título, destaque, separadores e marcador de imagem",()=>{
   const bbcode=markdownToBbcode(sample);
   expect(bbcode).toContain("[size=18][b]TESTE DE DESCONTO[/b][/size]");
   expect(bbcode).toContain("[hr]");
   expect(bbcode).toContain("[b]Caminho de acesso:[/b]");
   expect(bbcode).toContain("[i][Imagem: captura-da-funcionalidade.png][/i]");
   expect(bbcode).toContain("[b]TAREFA:[/b] 67866");
   expect(validateBbcodePost(bbcode)).toEqual([]);
 });
 it("nunca inventa URL de imagem nem ativa links não HTTPS",()=>{
   const out=markdownToBbcode("# Segurança\n[Imagem: foto.png]\n[Abrir](javascript:alert(1))");
   expect(out).not.toMatch(/\[img\]/i);
   expect(out).not.toMatch(/\[url=javascript:/i);
   expect(out).toContain("[Imagem: foto.png]");
 });
 it("identifica conteúdo obrigatório incompleto",()=>{
   expect(validateBbcodePost("[b]Sem título[/b]")).toContain("Título");
   expect(validateBbcodePost("[size=18][b]Teste[/b][/size]")).toContain("Marcador de imagem");
 });
});
