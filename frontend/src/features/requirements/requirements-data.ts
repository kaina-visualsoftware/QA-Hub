import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { normalizeRequirement, prepareImport } from "../../lib/legacy/qa-requirements.mjs";
import type { DraftRequirement } from "../../lib/legacy/qa-requirements.mjs";
import {
  saveRequirementScenarioLinks
} from "../../lib/legacy/qa-requirements-coverage.mjs";
import type { CoverageLink } from "../../lib/legacy/qa-requirements-coverage.mjs";
import {
  validateRequirementFile, storagePathForFile, sha256Hex, FILE_BUCKET
} from "../../lib/legacy/qa-requirements-files.mjs";

const fail = (error: { message: string } | null) => {
  if (error) throw Error(error.message);
};
const uuid = z.uuid();
const types = z.enum(["RF", "RNF", "RN", "CA"]);
const states = z.enum(["rascunho", "aprovado", "arquivado"]);
export const requirementSchema = z.object({
  id: uuid, tarefa_id: uuid, user_id: uuid,
  fonte_id: uuid.nullish(), codigo: z.string(),
  tipo: types, titulo: z.string(), descricao: z.string(),
  criterios_aceite: z.string(), estado: states,
  origem_trecho: z.string(), ordem: z.number(),
  versao: z.number().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string()
});
export type Requirement = z.infer<typeof requirementSchema>;
const sourceSchema = z.object({
  id: uuid, tarefa_id: uuid, user_id: uuid,
  tipo_fonte: z.enum(["texto", "arquivo"]),
  nome_arquivo: z.string().nullish(),
  mime: z.string().nullish(), storage_path: z.string().nullish(),
  hash: z.string().nullish(), versao: z.number(),
  tamanho_arquivo: z.number().nullish(),
  texto_extraido: z.string(), created_at: z.string()
});
export type RequirementSource = z.infer<typeof sourceSchema>;
const usageSchema = z.object({
  id: uuid, tarefa_id: uuid,
  tipo: z.enum(["post", "teste", "diagrama"]),
  artefato_ref: z.string(), quantidade: z.number(),
  created_at: z.string(), requisitos_snapshot: z.array(z.object({
    codigo: z.string(), titulo: z.string(),
    descricao: z.string(), criterios_aceite: z.string().optional(),
    updated_at: z.string().optional()
  }).passthrough())
});
export type RequirementUsage = z.infer<typeof usageSchema>;
const revisionSchema = z.object({
  id: uuid, tarefa_id: uuid, versao: z.number(),
  codigo: z.string(), titulo: z.string(), descricao: z.string(),
  criterios_aceite: z.string(), estado: states, created_at: z.string()
});
export type RequirementRevision = z.infer<typeof revisionSchema>;

export async function listRequirements(taskId: string): Promise<Requirement[]> {
  uuid.parse(taskId);
  const { data, error } = await supabase.from("qa_requisitos")
    .select("id,tarefa_id,user_id,fonte_id,codigo,tipo,titulo,descricao,criterios_aceite,estado,origem_trecho,ordem,versao,created_at,updated_at")
    .eq("tarefa_id", taskId).order("ordem", { ascending: true }).limit(501);
  fail(error);
  if ((data ?? []).length > 500) throw Error("Mais de 500 requisitos. Refine os registros antes de editar.");
  return (data ?? []).map((item) => requirementSchema.parse(item));
}
export async function importRequirementText(taskId: string, source: string, items: DraftRequirement[]) {
  uuid.parse(taskId);
  const prepared = prepareImport(source, items);
  const { data, error } = await supabase.rpc("qa_import_requisitos", {
    p_tarefa_id: taskId, p_texto: prepared.text, p_itens: prepared.items
  });
  fail(error);
  if (data?.tarefa_id !== taskId || !Number.isInteger(data.inserted) ||
      !Number.isInteger(data.skipped)) throw Error("O banco não confirmou a importação.");
  return { inserted: Number(data.inserted), skipped: Number(data.skipped) };
}
export async function importRequirementSource(
  taskId: string, sourceId: string, sourceText: string,
  items: DraftRequirement[], sources: RequirementSource[]
) {
  uuid.parse(taskId); uuid.parse(sourceId);
  const chosen = sources.find((item) => item.id === sourceId &&
    item.tarefa_id === taskId && item.tipo_fonte === "arquivo");
  if (!chosen || !chosen.texto_extraido || sourceText !== chosen.texto_extraido) {
    throw Error("A fonte original foi alterada ou está indisponível. Selecione o arquivo novamente.");
  }
  const prepared = prepareImport(sourceText, items);
  const { data, error } = await supabase.rpc("qa_import_requisitos_da_fonte", {
    p_tarefa_id: taskId, p_fonte_id: sourceId, p_itens: prepared.items
  });
  fail(error);
  if (data?.tarefa_id !== taskId || data?.fonte_id !== sourceId ||
      !Number.isInteger(data.inserted) || !Number.isInteger(data.skipped)) {
    throw Error("O banco não confirmou os requisitos vinculados ao arquivo.");
  }
  return { inserted: Number(data.inserted), skipped: Number(data.skipped) };
}

export async function editRequirement(taskId: string, id: string, item: Requirement) {
  uuid.parse(taskId); uuid.parse(id);
  if (item.tarefa_id !== taskId || item.id !== id) throw Error("Requisito não pertence à TF.");
  const valid = normalizeRequirement({ ...item, estado: item.estado === "arquivado" ? "rascunho" : item.estado });
  const { data, error } = await supabase.from("qa_requisitos")
    .update({
      codigo: valid.codigo, tipo: valid.tipo, titulo: valid.titulo,
      descricao: valid.descricao, criterios_aceite: valid.criterios_aceite,
      estado: valid.estado, origem_trecho: valid.origem_trecho, ordem: valid.ordem,
      updated_at: new Date().toISOString()
    }).eq("id", id).eq("tarefa_id", taskId).select("id").maybeSingle();
  fail(error);
  if (!data) throw Error("Não foi possível atualizar o requisito.");
}
export async function changeRequirementState(taskId: string, id: string, state: Requirement["estado"]) {
  uuid.parse(taskId); uuid.parse(id); states.parse(state);
  const { data, error } = await supabase.from("qa_requisitos")
    .update({ estado: state, updated_at: new Date().toISOString() })
    .eq("id", id).eq("tarefa_id", taskId).select("id").maybeSingle();
  fail(error);
  if (!data) throw Error("Requisito não encontrado ou sem permissão.");
}
export async function listRequirementLinks(taskId: string): Promise<CoverageLink[]> {
  uuid.parse(taskId);
  const { data, error } = await supabase.from("qa_requisito_cenarios")
    .select("id,tarefa_id,requisito_id,cenario_id").eq("tarefa_id", taskId).limit(5001);
  fail(error);
  if ((data ?? []).length > 5000) throw Error("Mais de 5.000 vínculos cadastrados.");
  return z.array(z.object({
    id: uuid, tarefa_id: uuid, requisito_id: uuid, cenario_id: uuid
  })).parse(data ?? []);
}
export async function linkRequirementToScenarios(taskId: string, requirementId: string, scenarioIds: string[]) {
  return saveRequirementScenarioLinks(supabase, { taskId, requirementId, scenarioIds });
}
export async function listRequirementRevisions(taskId: string, requirementId: string): Promise<RequirementRevision[]> {
  uuid.parse(taskId); uuid.parse(requirementId);
  const { data, error } = await supabase.from("qa_requisito_revisoes")
    .select("id,tarefa_id,versao,codigo,titulo,descricao,criterios_aceite,estado,created_at")
    .eq("tarefa_id", taskId).eq("requisito_id", requirementId)
    .order("versao", { ascending: false }).limit(100);
  fail(error);
  return z.array(revisionSchema).parse(data ?? []);
}
export async function listRequirementSources(taskId: string): Promise<RequirementSource[]> {
  uuid.parse(taskId);
  const { data, error } = await supabase.from("qa_requisito_fontes")
    .select("id,tarefa_id,user_id,tipo_fonte,nome_arquivo,mime,storage_path,hash,versao,tamanho_arquivo,texto_extraido,created_at")
    .eq("tarefa_id", taskId).order("created_at", { ascending: false }).limit(201);
  fail(error);
  if ((data ?? []).length > 200) throw Error("Muitas fontes registradas. Consulte a versão anterior.");
  return z.array(sourceSchema).parse(data ?? []);
}
export async function listRequirementUsage(taskId: string): Promise<RequirementUsage[]> {
  uuid.parse(taskId);
  const { data, error } = await supabase.from("qa_geracao_contextos")
    .select("id,tarefa_id,tipo,artefato_ref,requisitos_snapshot,quantidade,created_at")
    .eq("tarefa_id", taskId).order("created_at", { ascending: false }).limit(100);
  fail(error);
  return z.array(usageSchema).parse(data ?? []);
}
export async function downloadRequirementSource(item: RequirementSource): Promise<Blob> {
  if (item.tipo_fonte !== "arquivo" || !item.storage_path) throw Error("Esta fonte não possui arquivo.");
  const { data, error } = await supabase.storage.from(FILE_BUCKET).download(item.storage_path);
  fail(error);
  if (!data) throw Error("Arquivo indisponível.");
  return data;
}

export type PreparedFile = {
  file: File; bytes: Uint8Array; mime: string; extension: string;
  size: number; hash: string; text: string; warning: string;
};

export async function prepareRequirementFile(file: File, suppliedText = ""): Promise<PreparedFile> {
  validateRequirementFile(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = validateRequirementFile(file, bytes);
  const hash = await sha256Hex(bytes);
  let text = suppliedText.trim();
  let warning = "";
  if (info.extension === "txt" || info.extension === "md") {
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "").trim(); }
    catch {
      text = new TextDecoder("windows-1252").decode(bytes).trim();
      warning = "Texto interpretado como Windows-1252. Confira os acentos antes de importar.";
    }
  } else {
    warning = "PDF/DOCX: o arquivo original será salvo. Nesta interface, cole manualmente o texto a indexar; extração automática ainda está pendente.";
  }
  if (text.length > 30000) {
    if (info.extension === "txt" || info.extension === "md") {
      warning += " Texto com mais de 30 mil caracteres: revise o trecho inicial antes da importação.";
      text = text.slice(0, 30000);
    } else throw Error("O texto informado ultrapassa 30 mil caracteres.");
  }
  return { file, bytes, hash, mime: info.mime, extension: info.extension,
    size: info.size, text, warning: warning.trim() };
}
export async function registerRequirementFile(taskId: string, userId: string, item: PreparedFile) {
  uuid.parse(taskId); uuid.parse(userId);
  const path = storagePathForFile(userId, taskId, crypto.randomUUID(), item.extension);
  const { error: uploadError } = await supabase.storage.from(FILE_BUCKET).upload(path, item.file, {
    contentType: item.mime, upsert: false, cacheControl: "3600"
  });
  fail(uploadError);
  try {
    const { data, error } = await supabase.rpc("qa_register_requirement_file", {
      p_tarefa_id: taskId, p_path: path, p_nome: item.file.name,
      p_mime: item.mime, p_sha256: item.hash, p_tamanho: item.size,
      p_texto_extraido: item.text
    });
    fail(error);
    if (data?.tarefa_id !== taskId || !data.id) throw Error("O banco não confirmou o arquivo.");
    return { id: uuid.parse(data.id), version: Number(data.versao) };
  } catch (reason) {
    // Cleanup is only permitted for unregistered objects. Registered versions
    // remain immutable and must never be removed after a successful RPC.
    const { data: registered } = await supabase.from("qa_requisito_fontes")
      .select("id").eq("storage_path", path).maybeSingle();
    if (!registered) {
      await supabase.storage.from(FILE_BUCKET).remove([path]).catch(() => undefined);
    }
    throw reason;
  }
}
