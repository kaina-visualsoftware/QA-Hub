import {describe,expect,it,vi} from "vitest";
import {AiRequestError,readAiHttpError,withAiRateLimitRetry,abortableWait} from "../src/lib/ai-retry";

describe("F2 — errors and automatic quota retry",()=>{
 it("reads Retry-After, stable code and request ID without reflecting unknown payload fields",async()=>{
  const id="123e4567-e89b-42d3-a456-426614174000";
  const response=new Response(JSON.stringify({code:"provider_rate_limited",
   error:"rate_limit",message:"Limite temporário",request_id:id,foo:"SECRET"}),{
   status:429,headers:{"Retry-After":"4"}
  });
  const error=await readAiHttpError(response);
  expect(error.code).toBe("provider_rate_limited");
  expect(error.status).toBe(429);
  expect(error.retryAfterSeconds).toBe(4);
  expect(error.requestId).toBe(id);
  expect(JSON.stringify(error)).not.toContain("SECRET");
 });
 it("waits for quota release and then retries without changing the operation",async()=>{
  let calls=0;
  const states:unknown[]=[];
  const wait=vi.fn(async()=>{});
  const answer=await withAiRateLimitRetry(async()=>{
   calls++;
   if(calls===1)throw new AiRequestError(429,{code:"quota_exhausted",retryAfterSeconds:6});
   return "OK";
  },{wait,onWait:s=>states.push(s)});
  expect(answer).toBe("OK");
  expect(calls).toBe(2);
  expect(wait).toHaveBeenCalledWith(6000,undefined);
  expect(states.some(s=>s!==null)).toBe(true);
  expect(states.at(-1)).toBeNull();
 });
 it("never retries 500, 401 or SSE processing errors",async()=>{
  for(const status of [401,500]){
   let n=0;
   await expect(withAiRateLimitRetry(async()=>{n++;throw new AiRequestError(status);},
    {wait:async()=>{}})).rejects.toBeInstanceOf(AiRequestError);
   expect(n).toBe(1);
  }
 });
 it("caps retries and total wait to prevent infinite loops",async()=>{
  let calls=0;
  const failure=new AiRequestError(429,{retryAfterSeconds:70});
  await expect(withAiRateLimitRetry(async()=>{calls++;throw failure;},
   {wait:async()=>{}})).rejects.toBe(failure);
  expect(calls).toBe(2); // the second 70 seconds exceeds cumulative 120s
  calls=0;
  await expect(withAiRateLimitRetry(async()=>{calls++;throw new AiRequestError(429,{retryAfterSeconds:3});},
   {wait:async()=>{}})).rejects.toBeInstanceOf(AiRequestError);
  expect(calls).toBe(3);
 });
 it("canceling during backoff avoids the next request",async()=>{
  const controller=new AbortController();
  let calls=0;
  const pending=withAiRateLimitRetry(async()=>{calls++;throw new AiRequestError(429,{retryAfterSeconds:5});},
   {signal:controller.signal,onWait:()=>{},wait:abortableWait});
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  controller.abort();
  await expect(pending).rejects.toMatchObject({name:"AbortError"});
  expect(calls).toBe(1);
 });
 it("a missing server Retry-After uses a clearly marked conservative delay",async()=>{
  let status:unknown=null,calls=0;
  const value=await withAiRateLimitRetry(async()=>{
   calls++;if(calls===1)throw new AiRequestError(429,{code:"provider_rate_limited"});
   return "done";
  },{wait:async()=>{},onWait:s=>{if(s)status=s;}});
  expect(value).toBe("done");
  expect(status).toMatchObject({estimated:true,source:"provider"});
 });
});
