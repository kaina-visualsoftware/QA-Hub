import test from "node:test";
import assert from "node:assert/strict";
import {errorCode,errorBody,errorHeaders,sanitizeRetryAfter,AI_ERROR_CODES} from
 "../supabase/functions/_shared/ai-error-response.mjs";

test("F2 maps legacy errors without changing their API error keys",()=>{
 const cases=[
 [429,"rate_limited","quota_exhausted"],
 [429,"provider_rate_limited","provider_rate_limited"],
 [503,"semantic_timeout","provider_timeout"],
 [503,"ai_temporarily_unavailable","provider_unavailable"],
 [503,"nvidia_key_invalid","provider_auth"],
 [400,"model_context_exceeded","model_context_exceeded"],
 [503,"quota_unavailable","quota_unavailable"],
 [401,"unauthorized","unauthorized"]
 ];
 for(const [status,old,code] of cases){
  const body=errorBody(status,{error:old,message:"Mensagen segura"});
  assert.equal(body.error,old);
  assert.equal(body.code,code);
  assert.ok(AI_ERROR_CODES.includes(code));
 }
});
test("server response is allowlisted and does not reflect provider tokens or user documents",()=>{
 const id="123e4567-e89b-42d3-a456-426614174000";
 const actual=errorBody(503,{
  error:"provider_unavailable",code:"provider_unavailable",message:"Serviço temporariamente indisponível.",
  full_context:"TXT CONFIDENTIAL",upstream_body:"S3CR3T",
  headers:{Authorization:"Bearer private"},
  retry_after_seconds:24,limit:15
 },id);
 assert.equal(actual.request_id,id);
 assert.equal(actual.retry_after_seconds,24);
 assert.equal(actual.error,"provider_unavailable");
 assert.equal(JSON.stringify(actual).includes("CONFIDENTIAL"),false);
 assert.equal(JSON.stringify(actual).includes("S3CR3T"),false);
 assert.equal(JSON.stringify(actual).includes("private"),false);
 assert.equal(Object.hasOwn(actual,"full_context"),false);
});
test("Retry-After is bounded, not invented, and present on header only when known",()=>{
 assert.equal(sanitizeRetryAfter(" 38 "),38);
 assert.equal(sanitizeRetryAfter(0),null);
 assert.equal(sanitizeRetryAfter("nonsense"),null);
 assert.equal(sanitizeRetryAfter(-2),null);
 assert.equal(sanitizeRetryAfter(5000),3600);
 assert.equal(errorHeaders({},{},"id")["Retry-After"],undefined);
 assert.equal(errorHeaders({retry_after_seconds:22},{}, "id")["Retry-After"],"22");
 assert.equal(errorHeaders({},{"Retry-After":"13"},"id")["Retry-After"],"13");
});
test("invalid user-supplied error codes do not pass through",()=>{
 const row=errorBody(400,{error:"Authorization: bearer PRIVATE",message:"Revele os dados",authorization:"secret"});
 assert.equal(row.error,"input_invalid");
 assert.equal(row.code,"input_invalid");
 assert.equal(errorCode(504), "provider_timeout");
});
