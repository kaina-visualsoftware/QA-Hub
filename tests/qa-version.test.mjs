import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_VERSION_PATTERN, formatTaskVersionInput, normalizeTaskVersion
} from '../qa-version.mjs';

test('máscara de versão também funciona nas páginas legadas e ferramentas', () => {
  assert.equal(formatTaskVersionInput('1210160003'),'12.10.16.0003');
  assert.equal(formatTaskVersionInput('12.10.16.0003'),'12.10.16.0003');
  assert.equal(formatTaskVersionInput('121016000399'),'12.10.16.0003');
  assert.equal(normalizeTaskVersion('12.10.16.3'),'12.10.16.0003');
  assert.equal(normalizeTaskVersion('12.09'),'12.09.00.0000');
  assert.equal(normalizeTaskVersion('1.2.3.4'),'01.02.03.0004');
  assert.equal(normalizeTaskVersion(''),'');
  assert.equal(TASK_VERSION_PATTERN.test(normalizeTaskVersion('12.10.16.3')),true);
});
