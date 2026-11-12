import {describe,expect,it} from "vitest";
import {MAX_AI_LOG_FILE_BYTES,parseAiLogExport,summarizeAiAttempts,
 groupAiAttempts,aiMetricWarnings} from "../src/features/ai-monitoring/ai-metrics";
const base={event:"qa_ai_attempt",version:1,stage:"provider",mode:"task",
 model:"z-ai/glm-5.3-flash",outcome:"ok",elapsed_ms:1000,
 http_status:200,fallback_model:false,prompt_tokens_est:78,
 usage:{total_tokens:111}};
describe("F8 — importação local de telemetria minimizada",()=>{
 it("importa JSONL e ignora dados estranhos, sem manter payloads do modelo",()=>{
  const source=[{...base,source:"TF confidencial",headers:{authorization:"SECRET"}},
   {...base,outcome:"timeout",elapsed_ms:12000,fallback_model:true},
   {...base,event:"other"},{}].map(item=>JSON.stringify(item)).join("\n");
  const parsed=parseAiLogExport(source);
  expect(parsed.attempts).toHaveLength(2);
  expect(parsed.ignored).toBe(2);
  expect(JSON.stringify(parsed)).not.toContain("TF confidencial");
  expect(JSON.stringify(parsed)).not.toContain("SECRET");
 });
 it("aceita exportação Supabase com event_message em JSON e rejeita formato malformado",()=>{
  const logs=[{event_message:"qa_ai_attempt "+JSON.stringify(base)},
   {event_message:"qa_ai_attempt {not JSON}"}];
  const parsed=parseAiLogExport(JSON.stringify(logs));
  expect(parsed.attempts).toHaveLength(1);
  expect(parsed.ignored).toBe(1);
 });
 it("não renderiza ou aceita modos/status fora do catálogo",()=>{
  const rows=parseAiLogExport(JSON.stringify([
   {...base,mode:"<script>alert(1)</script>"},
   {...base,model:"arbitrary/paid"}, {...base,http_status:1000},
   base]));
  expect(rows.attempts).toHaveLength(1);
  expect(rows.ignored).toBe(3);
 });
 it("calcula sucesso apenas com chamadas reais e separa cota negada",()=>{
  const parsed=parseAiLogExport(JSON.stringify([
   base,{...base,outcome:"timeout",elapsed_ms:3000},
   {...base,stage:"quota",outcome:"rate_limited",http_status:429},
   {...base,stage:"discovery",model:"catalog"},
   {...base,outcome:"length",elapsed_ms:9000}
  ]));
  const stats=summarizeAiAttempts(parsed.attempts);
  expect(stats.providerAttempts).toBe(3);
  expect(stats.providerSuccess).toBe(1);
  expect(stats.successPercent).toBe(33.3);
  expect(stats.quotaDenied).toBe(1);
  expect(stats.p50Ms).toBe(3000);
  expect(stats.p95Ms).toBe(9000);
  expect(stats.truncated).toBe(1);
  expect(groupAiAttempts(parsed.attempts)).toHaveLength(1);
 });
 it("relata amostra insuficiente antes de inferir alertas",()=>{
  const rows=parseAiLogExport(JSON.stringify([base]));
  expect(aiMetricWarnings(summarizeAiAttempts(rows.attempts))[0])
   .toMatch(/Amostra insuficiente/);
 });
 it("recusa arquivos muito grandes",()=>{
  expect(()=>parseAiLogExport(" ".repeat(MAX_AI_LOG_FILE_BYTES+1)))
   .toThrow(/2 MB/);
 });
});
