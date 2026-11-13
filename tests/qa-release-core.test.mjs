import test from 'node:test';
import assert from 'node:assert/strict';
import {organizeRelease,reviewRelease,compareTextLines,releaseTaskScope} from '../qa-release-core.mjs';

test('native release organizer preserves SIA status classification',()=>{
  const result=organizeRelease({
    version:'12.10.06.0000',defaultStatus:'12',
    raw:'Status 12\n#67866 — BUG — Erro no desconto\nStatus 11\n#199727 — MELHORIA — Ajuste do cadastro'
  });
  assert.match(result.text,/12.10.06.0000/);
  assert.match(result.text,/Status 12[\s\S]*#67866/);
  assert.match(result.text,/Status 11[\s\S]*#199727/);
  assert.deepEqual(result.numbers,['67866','199727']);
});
test('native release review retains original mismatch reports',()=>{
  const result=reviewRelease({
    version:'12.10.06.0000',
    raw:'#67866 — BUG — Correção de pedido',
    announcement:'Correções:\n#67866 — BUG — Desconto corrigido\n#299999 — BUG — Outra correção'
  });
  assert.match(result.cleaned,/#67866/);
  assert.doesNotMatch(result.cleaned,/#299999/);
  assert.match(result.report,/Removidas por não estarem na lista/);
  assert.match(result.bbcode,/12.10.06.0000/);
});
test('native text comparison never interprets unchanged content as change',()=>{
  const diff=compareTextLines('A\nB\nC','A\nD\nC');
  assert.equal(diff.added,1);
  assert.equal(diff.removed,1);
  assert.deepEqual(diff.changes.map(x=>x[0]),[' ','-','+',' ']);
  assert.throws(()=>compareTextLines('a\n'.repeat(1501),'b'),/1\.500/);
});

test('release marks only client 6157 Visual Software as INTERNA and other clients as EXTERNA',()=>{
 const result=organizeRelease({
  version:'12.10.06.0000',
  raw:[
   'Status 12',
   '#201632 — BUG — 6157 Visual Software',
   '#201633 — MELHORIA — 6157 - Visual Software',
   '#201634 — BUG — 61570 Visual Software',
   'Status 11',
   '#201635 — MELHORIA — 6810 Outra Empresa',
   '#201636 — BUG — Sem cliente informado'
  ].join('\n')
 });
 assert.match(result.text,/- #201632 — BUG \(INTERNA\) — SEM SPRINT/);
 assert.match(result.text,/- #201633 — MELHORIA \(INTERNA\) — SEM SPRINT/);
 assert.match(result.text,/- #201634 — BUG \(EXTERNA\) —/);
 assert.match(result.text,/- #201635 — MELHORIA \(EXTERNA\) —/);
 assert.match(result.text,/- #201636 — BUG \(EXTERNA\) —/);
 assert.deepEqual(result.numbers,['201632','201633','201634','201635','201636']);
});
test('client scope uses full literal customer identifier and preserves real sprint',()=>{
 assert.equal(releaseTaskScope(['#201632','Cliente: 6157 Visual Software']),'INTERNA');
 assert.equal(releaseTaskScope(['6157 - VISUAL SOFTWARE']),'INTERNA');
 assert.equal(releaseTaskScope(['Cliente: 6157 Visual Software Ltda']),'INTERNA');
 assert.equal(releaseTaskScope(['Cliente: 6157 Empresa Diferente']),'EXTERNA');
 assert.equal(releaseTaskScope(['Cliente: 96157 Visual Software']),'EXTERNA');
 assert.equal(releaseTaskScope(['#6157 Visual Software']),'EXTERNA');
 const organized=organizeRelease({
  version:'12.10.06.0000',team:'Sprint Fiscal',
  raw:'#201632 — BUG — 6157 Visual Software — Sprint Fiscal'
 });
 assert.match(organized.text,/- #201632 — BUG \(INTERNA\) — Sprint Fiscal/);
});
