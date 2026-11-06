import test from 'node:test';
import assert from 'node:assert/strict';
import {organizeRelease,reviewRelease,compareTextLines} from '../qa-release-core.mjs';

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
