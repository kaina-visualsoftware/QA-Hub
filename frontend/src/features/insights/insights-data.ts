import {z} from "zod";
import {supabase} from "../../lib/supabase";

const quantity=z.number().int().nonnegative();
const moduleItem=z.object({
  modulo:z.string(),tarefas:quantity,casos:quantity,
  executados:quantity,problemas:quantity
});
const versionItem=moduleItem.extend({
  versao:z.string(),aprovadas:quantity
});
const monthItem=z.object({
  mes:z.string().regex(/^\d{4}-\d{2}$/),
  alteracoes:quantity,regressoes:quantity,aprovacoes:quantity
});
export const qaInsightsSchema=z.object({
  modules:z.array(moduleItem),
  versions:z.array(versionItem),
  months:z.array(monthItem),
  regressions:quantity,
  period_months:z.number().int().min(3).max(12)
});
export type QaInsights=z.infer<typeof qaInsightsSchema>;
export type QaInsightsPeriod=3|6|12;
export function coveragePercent(executed:number,total:number){
  return total>0?Math.round(Math.min(Math.max(executed,0),total)/total*100):0;
}
export function monthLabel(month:string){
  const match=/^(\d{4})-(\d{2})$/.exec(month);
  if(!match)return month;
  return new Date(Date.UTC(Number(match[1]),Number(match[2])-1,1))
    .toLocaleDateString("pt-BR",{month:"short",year:"numeric",timeZone:"UTC"});
}
export async function fetchQaInsights(months:QaInsightsPeriod):Promise<QaInsights>{
  const {data,error}=await supabase.rpc("qa_insights_v1",{p_months:months});
  if(error)throw error;
  return qaInsightsSchema.parse(data);
}
