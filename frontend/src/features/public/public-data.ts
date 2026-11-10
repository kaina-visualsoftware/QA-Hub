import { z } from "zod";
import { normalizeTaskVersion } from "../../lib/task-version";
import { supabase, supabaseUrl } from "../../lib/supabase";

// Fail closed on new publications until the database-side public projection
// and RLS lockdown have been homologated. This is a rollout guard, NOT RLS.
export const publicSharingEnabled = import.meta.env.VITE_PUBLIC_SHARING_ENABLED === "true";

const uuid = z.uuid();
export const publicTaskCardSchema = z.object({
  id: uuid,
  titulo: z.string(),
  codigo: z.string().nullish(),
  tipo_teste: z.string(),
  sistema: z.string().nullish(),
  versao: z.string().nullish().transform(value => value == null ? value : normalizeTaskVersion(value)),
  executado_em: z.string().nullish()
});
export const publicTaskDetailSchema = publicTaskCardSchema.extend({
  status: z.string(),
  descricao: z.string().nullish(),
  explicacao: z.string().nullish(),
  causa: z.string().nullish(),
  correcao: z.string().nullish(),
  conclusao: z.string().nullish(),
  observacoes: z.string().nullish()
});
export const publicScenarioSchema = z.object({
  id: uuid, titulo: z.string(), ordem: z.number(),
  passos: z.string().nullish(), esperado: z.string().nullish(),
  obtido: z.string().nullish(), observacoes: z.string().nullish(),
  status: z.string().nullish()
});
export const publicEvidenceSchema = z.object({
  id:uuid,cenario_id:uuid.nullable(),nome_original:z.string(),
  descricao:z.string(),mime_type:z.string()
});
export const publicDiagramSchema = z.object({
  id: uuid, titulo: z.string(), conteudo: z.string()
});
export const publicDocumentSchema=z.object({
  id:uuid,tipo:z.string(),titulo:z.string(),conteudo:z.string(),versao:z.number(),created_at:z.string()
});
export const publicSourceSchema=z.object({
  id:uuid,tipo_fonte:z.enum(["texto","arquivo"]),nome_arquivo:z.string().nullish(),
  mime:z.string().nullish(),versao:z.number(),texto_extraido:z.string(),created_at:z.string()
});
export const publicRequirementSchema=z.object({
  id:uuid,codigo:z.string(),tipo:z.string(),titulo:z.string(),descricao:z.string(),
  criterios_aceite:z.string(),estado:z.string(),ordem:z.number()
});
export const publicNoteSchema=z.object({
  id:uuid,cenario_id:uuid.nullish(),tipo:z.string(),resumo:z.string(),referencia:z.string(),created_at:z.string()
});
export type PublicTaskCard = z.infer<typeof publicTaskCardSchema>;
export type PublicTaskDetail = z.infer<typeof publicTaskDetailSchema>;
export type PublicScenario = z.infer<typeof publicScenarioSchema>;
export type PublicDiagram = z.infer<typeof publicDiagramSchema>;
export type PublicEvidence = z.infer<typeof publicEvidenceSchema>;

export function publicAttachmentUrl(fileId:string,kind:"evidence"|"source"="evidence"):string {
  uuid.parse(fileId);
  const base=supabaseUrl;
  if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(base))
    throw Error("Servidor de imagens públicas indisponível.");
  return base.replace(/\/$/,"")+"/functions/v1/qa-public-evidence?file="+fileId+"&kind="+kind;
}

export const publicEvidenceImageUrl = (fileId:string) => publicAttachmentUrl(fileId);

export const PUBLIC_TASK_COLUMNS =
  "id,titulo,codigo,tipo_teste,sistema,versao,executado_em";
export const PUBLIC_DETAIL_COLUMNS = PUBLIC_TASK_COLUMNS +
  ",status,descricao,explicacao,causa,correcao,conclusao,observacoes";
export const PUBLIC_SCENARIO_COLUMNS = "id,titulo,ordem,passos,esperado,obtido,observacoes,status";
export const PUBLIC_DIAGRAM_COLUMNS = "id,titulo,conteudo";

// API-side allowlist: callers cannot query private table columns using these RPCs.
// Read functions are deliberately independent of the signed-in user's owner/admin role.
export async function listPublishedTasks(): Promise<PublicTaskCard[]> {
  const { data, error } = await supabase.rpc("qa_public_tasks_v1");
  if (error) throw Error("Não foi possível consultar a biblioteca pública.");
  return z.array(publicTaskCardSchema).parse(data ?? []);
}
export async function loadPublishedTask(taskId: string) {
  uuid.parse(taskId);
  const { data, error } = await supabase.rpc("qa_public_task_v1", { p_task_id: taskId });
  if (error) throw Error("Não foi possível carregar a TF pública.");
  if (data === null) return null;
  return z.object({
    task: publicTaskDetailSchema,
    scenarios: z.array(publicScenarioSchema),
    diagrams: z.array(publicDiagramSchema),
    evidencias:z.array(publicEvidenceSchema).default([]),
    documents:z.array(publicDocumentSchema).default([]),
    sources:z.array(publicSourceSchema).default([]),
    requirements:z.array(publicRequirementSchema).default([]),
    notes:z.array(publicNoteSchema).default([]),
    coverage:z.array(z.object({id:uuid,requisito_id:uuid,cenario_id:uuid})).default([]),
    releases:z.array(z.object({id:uuid,versao:z.string()})).default([]),
    comparisons:z.array(z.object({id:uuid,tipo:z.string(),adicionados:z.number(),removidos:z.number(),alterados:z.number()})).default([])
  }).parse(data);
}
export async function updatePublication(taskId: string, userId: string, publish: boolean) {
  uuid.parse(taskId);
  uuid.parse(userId);
  if (publish && !publicSharingEnabled) {
    throw Error("Publicação temporariamente indisponível até a homologação de segurança.");
  }
  const { data, error } = await supabase.from("qa_tarefas")
    .update({ publica: publish, updated_at: new Date().toISOString() })
    .eq("id", taskId).eq("user_id", userId)
    .select("id,publica").maybeSingle();
  if (error) throw Error(error.message);
  if (!data || data.id !== taskId || data.publica !== publish)
    throw Error("Não foi possível alterar a publicação. Somente o autor pode fazer isso.");
  return publish;
}
