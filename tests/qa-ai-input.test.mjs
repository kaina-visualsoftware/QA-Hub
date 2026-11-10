import test from 'node:test';
import assert from 'node:assert/strict';
import {aiInputError} from '../supabase/functions/qa-ai/input.mjs';
test('TF input has no fixed character ceiling in QA Hub',()=>{
 assert.equal(aiInputError('Relatório '.repeat(12000)),null);
 assert.ok(aiInputError('   '));
});
test('diagram pipeline retains its separate chunk contract',()=>{
 assert.ok(aiInputError('x'.repeat(20001),'diagram-summary'));
 assert.equal(aiInputError('x'.repeat(20000),'diagram-summary'),null);
});
