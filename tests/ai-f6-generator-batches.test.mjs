import test from "node:test";
import assert from "node:assert/strict";
import {GENERATOR_STAGE_IDS,parseGeneratorBatch,messagesForGeneratorBatch,
 MAX_CONTINUATIONS} from "../supabase/functions/qa-generators/batches.mjs";
import {messagesForGenerator} from "../supabase/functions/qa-generators/prompts.mjs";
const example=(mode,index,continuation=0)=>({
 version:1,index,total:GENERATOR_STAGE_IDS[mode].length,
 stage:GENERATOR_STAGE_IDS[mode][index],
 continuation,previousTail:continuation?"Continuação do último parágrafo gerado.":""
});
test("F6 deterministic post and cases stages are bounded",()=>{
 assert.deepEqual(GENERATOR_STAGE_IDS.post,["overview","details","closing"]);
 assert.deepEqual(GENERATOR_STAGE_IDS.teste,["setup","positive","negative","regression","closing"]);
 assert.equal(MAX_CONTINUATIONS,2);
 for(const mode of ["post","teste"])for(const [index] of GENERATOR_STAGE_IDS[mode].entries())
  assert.deepEqual(parseGeneratorBatch(example(mode,index),mode),example(mode,index));
});
test("F6 rejects invalid version, stage ordering, continuation, and oversized tails",()=>{
 assert.equal(parseGeneratorBatch({...example("post",0),stage:"closing"},"post"),null);
 assert.equal(parseGeneratorBatch({...example("post",0),version:2},"post"),null);
 assert.equal(parseGeneratorBatch({...example("post",0),total:20},"post"),null);
 assert.equal(parseGeneratorBatch({...example("post",0),index:99},"post"),null);
 assert.equal(parseGeneratorBatch({...example("post",0),continuation:3,previousTail:"anything"},"post"),null);
 assert.equal(parseGeneratorBatch({...example("post",0,1),previousTail:"abc"},"post"),null);
 assert.equal(parseGeneratorBatch({...example("post",0),previousTail:"not empty"},"post"),null);
 assert.equal(parseGeneratorBatch({...example("post",0),foo:"anything"},"post"),null);
 assert.equal(parseGeneratorBatch({...example("post",0,1),previousTail:"z".repeat(901)},"post"),null);
});
test("F6 category-specific prompts preserve input and never invent scenario status",()=>{
 const task="TF 67866: descontos negativos do kit.",req="RF-100: não duplicar valor.";
 const intro=messagesForGeneratorBatch("post",task,req,example("post",0),messagesForGenerator("post",task,req));
 const final=messagesForGeneratorBatch("post",task,req,example("post",2),messagesForGenerator("post",task,req));
 assert.match(intro[0].content,/caminho de acesso/);
 assert.match(final[0].content,/SOMENTE os dois campos finais/);
 assert.match(final[1].content,/RF-100/);
 const negative=messagesForGeneratorBatch("teste",task,req,example("teste",2),messagesForGenerator("teste",task,req));
 assert.match(negative[0].content,/cenários negativos/);
 assert.match(negative[0].content,/NÃO invente fatos/);
});
test("F6 continuation must have a nonempty bounded tail, and is not a new section",()=>{
 const task="TF 67866",req="";
 const b=example("post",1,1);
 const messages=messagesForGeneratorBatch("post",task,req,b,messagesForGenerator("post",task,req));
 assert.match(messages[0].content,/CONTINUAÇÃO 1 da MESMA etapa/);
 assert.match(messages[1].content,/Continuação do último parágrafo gerado/);
 assert.doesNotMatch(messages[0].content,/Continuação do último parágrafo gerado/);
 assert.equal(messages.length,2);
});
