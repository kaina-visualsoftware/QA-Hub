import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/qa_ai_f32_audit.sql",import.meta.url),"utf8");
test("F3.2 audit is append-only, owned, private and does not store source/model bodies",()=>{
 assert.match(sql,/create table if not exists public\.qa_ai_audit_trail/i);
 assert.match(sql,/alter table public\.qa_ai_audit_trail enable row level security/i);
 assert.match(sql,/revoke all on public\.qa_ai_audit_trail from public,anon,authenticated/i);
 assert.match(sql,/grant select on public\.qa_ai_audit_trail to authenticated/i);
 assert.match(sql,/grant insert\(tarefa_id,user_id,event_type,resource,reference_hash,/i);
 assert.doesNotMatch(sql,/grant (?:all|update|delete) on public\.qa_ai_audit_trail to authenticated/i);
 assert.match(sql,/foreign key\(tarefa_id,user_id\)[\s\S]+?public\.qa_tarefas\(id,user_id\)/i);
 assert.match(sql,/user_id=\(select auth\.uid\(\)\)/i);
 assert.match(sql,/coalesce\(\(select auth\.jwt\(\)->>'is_anonymous'\)::boolean,false\)=false/i);
 const definition=sql.split("create table if not exists public.qa_ai_audit_trail(")[1]
  .split("create index if not exists")[0];
 assert.doesNotMatch(definition,/\b(?:raw_text|prompt|model_response|password|secret|token|attachment_bytes)\s+text\b/i);
 assert.match(definition,/reference_hash text not null check\(reference_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i);
 assert.match(definition,/event_type='conflict_decision'/i);
 assert.match(definition,/decision is not null/i);
});
test("F3.2 audit events never grant implicit source edits or test execution",()=>{
 assert.doesNotMatch(sql,/\b(?:update|delete)\s+public\.qa_(?:tarefas|cenarios|requisitos)\b/i);
 assert.match(sql,/coverage_generation_requested/);
 assert.match(sql,/source_snapshot/);
 assert.match(sql,/test_revision_applied/);
});
