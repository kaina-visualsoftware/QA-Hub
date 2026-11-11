import {describe,it,expect} from 'vitest';
import {docAttachmentToken,documentReferencedFileIds,documentationDraftSchema,documentationFileFormat,looksLikeSql} from '../src/features/documentation/documentation-data';
import {splitDocumentMarkdown} from '../src/features/documentation/DocumentationMarkdown';
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
 it('aceita SQL, ZIP, JSON e preserva o ID de cada anexo',()=>{
  expect(documentationFileFormat({name:'estrutura.sql',type:'application/sql',size:500})).toBe('sql');
  expect(documentationFileFormat({name:'backup.zip',type:'application/x-zip-compressed',size:1000})).toBe('zip');
  expect(documentationFileFormat({name:'resposta.json',type:'application/json',size:100})).toBe('json');
  const id='22222222-2222-4222-8222-222222222222';
  expect(docAttachmentToken(id)).toBe('{{arquivo:'+id+'}}');
  expect([...documentReferencedFileIds(['# Manual','',''].join(String.fromCharCode(10))+docAttachmentToken(id))]).toEqual([id]);
 });
 it('detecta SQL colado, sem confundir texto comum com comandos',()=>{
  expect(looksLikeSql('CREATE TABLE usuarios (password text, token text);')).toBe(true);
  expect(looksLikeSql('SELECT id, nome FROM usuarios;')).toBe(true);
  expect(looksLikeSql('Esta documentação explica o requisito funcional e seu resultado.')).toBe(false);
 });
 it('renderiza arquivos no ponto inserido sem interpretar marcadores dentro de blocos SQL',()=>{
  const id='22222222-2222-4222-8222-222222222222';
  const source=['# Manual','',docAttachmentToken(id),'','```sql',docAttachmentToken(id),'```'].join(String.fromCharCode(10));
  const parts=splitDocumentMarkdown(source);
  expect(parts.filter(item=>item.kind==='attachment')).toEqual([{kind:'attachment',id}]);
  const last=parts.at(-1);
  expect(last?.kind).toBe('markdown');
  if(last?.kind!=='markdown')throw Error('Missing trailing Markdown section');
  expect(last.source).toContain('```sql');
 });
});
