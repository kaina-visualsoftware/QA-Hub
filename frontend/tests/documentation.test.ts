import {describe,it,expect} from 'vitest';
import {documentationDraftSchema,documentationFileFormat} from '../src/features/documentation/documentation-data';
describe('Documentações',()=>{
 it('começa privada e valida texto, tipo e vínculo',()=>{
  expect(documentationDraftSchema.parse({titulo:'Manual',conteudo:'Como resolver o problema'}).publica).toBe(false);
  expect(documentationDraftSchema.safeParse({titulo:'x',conteudo:'ok',tarefa_id:'invalid'}).success).toBe(false);
 });
 it('aceita imagem, vídeo e documento com limite explícito',()=>{
  expect(documentationFileFormat({name:'video.mp4',type:'video/mp4',size:100})).toBe('mp4');
  expect(documentationFileFormat({name:'manual.pdf',type:'application/pdf',size:100})).toBe('pdf');
  expect(()=>documentationFileFormat({name:'pagina.html',type:'text/html',size:100})).toThrow();
  expect(()=>documentationFileFormat({name:'video.mp4',type:'video/mp4',size:60*1024*1024})).toThrow();
 });
});
