import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTACHMENT_LIMIT,ATTACHMENT_TYPES,extensionForFile,
  validateRequirementFile,storagePathForFile,sha256Hex
} from '../qa-requirements-files.mjs';

const task='11111111-1111-4111-8111-111111111111';
const owner='22222222-2222-4222-8222-222222222222';
const fileId='33333333-3333-4333-8333-333333333333';
const asFile=(name,bytes,type='')=>({name,size:bytes.length,type});

test('R2: accept PDF/DOCX/TXT/MD and reject executable or oversized files',()=>{
  assert.deepEqual(Object.keys(ATTACHMENT_TYPES),['pdf','docx','txt','md']);
  assert.equal(extensionForFile('Regras.MD'),'md');
  assert.throws(()=>extensionForFile('requisito.exe'),/não suportado/);
  assert.throws(()=>extensionForFile('arquivo.doc'),/não suportado/);
  assert.throws(()=>validateRequirementFile({name:'a.txt',size:ATTACHMENT_LIMIT+1,type:'text/plain'}),/10 MB/);
  assert.throws(()=>validateRequirementFile({name:'x/evil.txt',size:1,type:'text/plain'}),/Nome de arquivo inválido/);
});

test('R2: detect altered signatures and binary masquerading as requirements',()=>{
  const pdf=new Uint8Array(Buffer.from('%PDF-1.7\n'));
  assert.equal(validateRequirementFile(asFile('doc.pdf',pdf,'application/pdf'),pdf).mime,'application/pdf');
  assert.throws(()=>validateRequirementFile(asFile('doc.pdf',new Uint8Array([70,70,70])),new Uint8Array([70,70,70])),/PDF válido/);
  const docx=new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3]);
  assert.equal(validateRequirementFile(asFile('doc.docx',docx),docx).extension,'docx');
  assert.throws(()=>validateRequirementFile(asFile('doc.docx',new Uint8Array([0,1,2])),new Uint8Array([0,1,2])),/DOCX válido/);
  assert.throws(()=>validateRequirementFile(asFile('doc.txt',new Uint8Array([65,0,66])),new Uint8Array([65,0,66])),/binário/);
});

test('R2: storage paths never contain filename or another task ID',()=>{
  assert.equal(storagePathForFile(owner,task,fileId,'docx'),
    owner+'/'+task+'/'+fileId+'.docx');
  assert.throws(()=>storagePathForFile('other-user',task,fileId,'md'),/Identificador/);
  assert.throws(()=>storagePathForFile(owner,task,fileId,'exe'),/Extensão/);
});

test('R2: SHA-256 is stable for bytewise duplicate detection',async()=>{
  const contents=new TextEncoder().encode('RF003: O operador confirma o pedido.');
  const digest=await sha256Hex(contents);
  assert.match(digest,/^[0-9a-f]{64}$/);
  assert.equal(digest,await sha256Hex(contents));
  assert.notEqual(digest,await sha256Hex(new TextEncoder().encode('RF003: Texto alterado.')));
});

test('R2: file metadata validation blocks extension/mime mismatch',()=>{
  const text=new TextEncoder().encode('RF-001: Texto para requisito.');
  assert.equal(validateRequirementFile(asFile('arquivo.txt',text,'text/plain'),text).mime,'text/plain');
  assert.throws(()=>validateRequirementFile(asFile('arquivo.pdf',text,'text/plain'),text),/PDF válido/);
  assert.throws(()=>validateRequirementFile(asFile('requisitos.txt',text,'image/jpeg'),text),/tipo real/);
});
